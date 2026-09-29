/* ============================================================================
 *  客户端本地库 · Local Replica
 * ----------------------------------------------------------------------------
 *  每个账号一个独立库（bc_client_<userId>）：界面只读本地库，因此离线可用、
 *  打开即有数据；云端变更经同步引擎落到这里，再由 liveQuery 驱动界面刷新。
 *
 *    outbox  离线队列（自增主键保证推送顺序）
 *    meta    游标 cursor、会话缓存 session 等键值
 * ========================================================================== */

import Dexie, { type Table } from 'dexie'
import { ref } from 'vue'
import type {
  Baby, CareLog, Checkin, EntityMap, EntityName, Invite, Member, Mutation, Note, Notice, Plan, PlanTask, Report,
} from '@/shared/types'
import { ENTITY_NAMES } from '@/shared/types'

export interface OutboxRow extends Mutation {
  seqNo?: number
}

export interface MetaRow {
  key: string
  value: unknown
}

export class ClientDB extends Dexie {
  members!: Table<Member, string>
  invites!: Table<Invite, string>
  babies!: Table<Baby, string>
  logs!: Table<CareLog, string>
  notes!: Table<Note, string>
  plans!: Table<Plan, string>
  tasks!: Table<PlanTask, string>
  checkins!: Table<Checkin, string>
  reports!: Table<Report, string>
  notices!: Table<Notice, string>
  outbox!: Table<OutboxRow, number>
  meta!: Table<MetaRow, string>

  constructor(userId: string) {
    super(`bc_client_${userId}`)
    this.version(1).stores({
      members: 'id, userId',
      invites: 'id',
      babies: 'id',
      logs: 'id, [babyId+date], [babyId+time], [babyId+type+time]',
      notes: 'id, [targetType+targetId], [babyId+date]',
      plans: 'id, [babyId+date]',
      tasks: 'id, [babyId+date]',
      checkins: 'id, [babyId+date], taskId',
      reports: 'id, [babyId+date]',
      notices: 'id, createdAt',
      outbox: '++seqNo, mid, [entity+id]',
      meta: 'key',
    })
  }

  entity<K extends EntityName>(name: K): Table<EntityMap[K], string> {
    return this.table(name)
  }

  entityTables(): Table[] {
    return ENTITY_NAMES.map((n) => this.table(n))
  }
}

let current: ClientDB | null = null

/** 本地库代次：切换账号后 +1，useLive 据此重新订阅 */
export const dbEpoch = ref(0)

export function openClientDB(userId: string): ClientDB {
  if (current?.name !== `bc_client_${userId}`) {
    current?.close()
    current = new ClientDB(userId)
    dbEpoch.value++
  }
  return current
}

export async function closeClientDB(erase = false): Promise<void> {
  const name = current?.name
  current?.close()
  current = null
  dbEpoch.value++
  if (erase && name) {
    await Dexie.delete(name)
  }
}

export const hasDB = (): boolean => current !== null

export function db(): ClientDB {
  if (!current) {
    throw new Error('本地数据库尚未打开')
  }
  return current
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db().meta.get(key))?.value as T | undefined
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db().meta.put({ key, value })
}
