/* ============================================================================
 *  同步引擎 · Sync Engine
 * ----------------------------------------------------------------------------
 *  一轮同步 = 先推后拉：
 *
 *    outbox ──push──▶ 云端裁决 ──▶ 成功：出队 / 失败：用云端版本回滚本地
 *                                   │
 *    本地库 ◀──pull── 变更流(seq > cursor) ◀┘   （仍在队列中的记录不被覆盖）
 *
 *  触发时机：本地写入（防抖）、云端广播、恢复联网、页面回到前台、30s 兜底轮询。
 *  同一时刻只跑一轮；运行中再次触发会在结束后补跑一次。
 * ========================================================================== */

import { liveQuery } from 'dexie'
import { reactive, watch } from 'vue'
import { errorMessage, isApiError, type ApiError } from '@/shared/errors'
import type { EntityName, MutationResult, Notice } from '@/shared/types'
import { db, type ClientDB, type OutboxRow } from '@/db/client'
import { isOnline } from './network'
import { transport } from './transport'

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error'

export const syncState = reactive({
  status: 'idle' as SyncStatus,
  pending: 0,
  lastSyncAt: 0,
  error: '',
})

export interface Rejection {
  entity: EntityName
  result: MutationResult
}

export interface SyncHooks {
  /** 本地改动被云端拒绝并已回滚 */
  onRejected?(list: Rejection[]): void
  /** 拉取到新的未读消息（首次全量拉取不提醒） */
  onNotices?(list: Notice[]): void
  /** 登录失效 / 已被移出家庭 */
  onKicked?(e: ApiError): void
}

const PUSH_BATCH = 50

class SyncEngine {
  hooks: SyncHooks = {}

  private token = ''
  private familyId = ''
  private running = false
  private rerun = false
  private retry = 0
  private timer: ReturnType<typeof setTimeout> | undefined
  private cleanups: (() => void)[] = []

  start(token: string, familyId: string): void {
    this.stop()
    this.token = token
    this.familyId = familyId

    const wake = () => this.schedule(0)
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        wake()
      }
    }
    const offRealtime = transport.subscribe((e) => {
      if (e.familyId === this.familyId) {
        wake()
      }
    })
    const offNetwork = watch(isOnline, (online) => {
      if (online) {
        wake()
      } else {
        syncState.status = 'offline'
      }
    })
    const pending = liveQuery(() => db().outbox.count()).subscribe({
      next: (n) => {
        syncState.pending = n
      },
    })
    const heartbeat = setInterval(wake, 30_000)
    document.addEventListener('visibilitychange', onVisible)

    this.cleanups.push(offRealtime, offNetwork, () => pending.unsubscribe(), () => clearInterval(heartbeat), () =>
      document.removeEventListener('visibilitychange', onVisible),
    )
    wake()
  }

  stop(): void {
    clearTimeout(this.timer)
    this.cleanups.splice(0).forEach((fn) => fn())
    this.token = ''
    this.familyId = ''
    syncState.status = 'idle'
    syncState.pending = 0
  }

  schedule(delay = 300): void {
    if (!this.token) {
      return
    }
    clearTimeout(this.timer)
    this.timer = setTimeout(() => void this.run(), delay)
  }

  /** 立即同步一轮，返回是否成功 */
  async syncNow(): Promise<boolean> {
    await this.run()
    return syncState.status === 'idle'
  }

  private async run(): Promise<void> {
    if (!this.token) {
      return
    }
    if (this.running) {
      this.rerun = true
      return
    }
    if (!isOnline()) {
      syncState.status = 'offline'
      return
    }
    const token = this.token
    const d = db()
    this.running = true
    syncState.status = 'syncing'
    try {
      await this.pushAll(d, token)
      await this.pullAll(d, token)
      syncState.status = 'idle'
      syncState.error = ''
      syncState.lastSyncAt = Date.now()
      this.retry = 0
    } catch (e) {
      if (token !== this.token) {
        return // 同步途中已切换账号，丢弃本轮结果
      }
      if (isApiError(e, 'NETWORK')) {
        syncState.status = 'offline'
      } else if (isApiError(e, 'UNAUTHORIZED') || isApiError(e, 'NO_FAMILY')) {
        syncState.status = 'error'
        syncState.error = e.message
        this.hooks.onKicked?.(e)
      } else {
        syncState.status = 'error'
        syncState.error = errorMessage(e)
        this.retry++
        this.schedule(Math.min(60_000, 2000 * 2 ** this.retry))
      }
    } finally {
      this.running = false
      if (this.rerun) {
        this.rerun = false
        this.schedule(0)
      }
    }
  }

  private async pushAll(d: ClientDB, token: string): Promise<void> {
    for (;;) {
      const batch: OutboxRow[] = await d.outbox.orderBy('seqNo').limit(PUSH_BATCH).toArray()
      if (!batch.length) {
        return
      }
      const res = await transport.push(
        token,
        batch.map((r) => ({ mid: r.mid, entity: r.entity, op: r.op, id: r.id, data: r.data, at: r.at })),
      )
      const byMid = new Map(res.results.map((r) => [r.mid, r]))
      const rejected: Rejection[] = []
      await d.transaction('rw', [d.outbox, ...d.entityTables()], async () => {
        for (const row of batch) {
          const result = byMid.get(row.mid)
          if (!result) {
            continue
          }
          await d.outbox.delete(row.seqNo!)
          if (result.ok) {
            continue
          }
          rejected.push({ entity: row.entity, result })
          // 回滚：以云端当前版本为准；云端不存在则删除本地乐观记录
          if (result.record && !result.record.deleted) {
            await d.table(row.entity).put(result.record)
          } else {
            await d.table(row.entity).delete(row.id)
          }
        }
      })
      if (rejected.length) {
        this.hooks.onRejected?.(rejected)
      }
    }
  }

  private async pullAll(d: ClientDB, token: string): Promise<void> {
    let cursor = ((await d.meta.get('cursor'))?.value as number | undefined) ?? 0
    const firstSync = cursor === 0
    for (;;) {
      const res = await transport.pull(token, cursor)
      const fresh: Notice[] = []
      await d.transaction('rw', [d.outbox, d.meta, ...d.entityTables()], async () => {
        const pending = new Set((await d.outbox.toArray()).map((r) => `${r.entity}:${r.id}`))
        for (const { entity, record } of res.changes) {
          if (pending.has(`${entity}:${record.id}`)) {
            continue // 本地还有未推送的改动，以本地为准，推送后再对齐
          }
          // 成员保留墓碑，便于已移出成员的历史记录仍能显示填写人
          if (record.deleted && entity !== 'members') {
            await d.table(entity).delete(record.id)
          } else {
            await d.table(entity).put(record)
          }
          if (entity === 'notices' && !record.deleted && !(record as Notice).readAt) {
            fresh.push(record as Notice)
          }
        }
        await d.meta.put({ key: 'cursor', value: res.cursor })
      })
      cursor = res.cursor
      if (fresh.length && !firstSync) {
        this.hooks.onNotices?.(fresh)
      }
      if (!res.hasMore) {
        return
      }
    }
  }
}

export const engine = new SyncEngine()
