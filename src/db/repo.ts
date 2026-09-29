/* ============================================================================
 *  本地写入仓库 · Repository
 * ----------------------------------------------------------------------------
 *  所有业务写入的唯一入口，保证三件事在同一个本地事务里完成：
 *
 *    权限预检（与云端同一张规则表）─▶ 乐观落库（界面立即可见）─▶ 追加离线队列
 *
 *  之后由同步引擎择机推送；云端若拒绝，引擎会用云端版本回滚本地。
 * ========================================================================== */

import { ApiError } from '@/shared/errors'
import { authorize, type Op } from '@/shared/policy'
import type { Actor, AnyEntity, BaseEntity, Checkin, EntityMap, EntityName, ID, MutationOp } from '@/shared/types'
import { uid } from '@/utils/id'
import { db } from './client'

type Envelope = keyof BaseEntity

export type Draft<T extends AnyEntity> = Omit<T, Envelope> & { id?: ID }
export type Patch<T extends AnyEntity> = Partial<Omit<T, Envelope>> & { id: ID }

interface RepoContext {
  actor: () => Actor | null
  onWrite: () => void
}

let ctx: RepoContext | null = null

export function bindRepo(c: RepoContext | null): void {
  ctx = c
}

function actorOrThrow(): Actor {
  const actor = ctx?.actor()
  if (!actor) {
    throw new ApiError('UNAUTHORIZED', '请先登录并加入家庭')
  }
  return actor
}

/** 去掉响应式代理与 undefined，得到可结构化克隆的纯数据 */
const plain = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

async function guard<K extends EntityName>(entity: K, op: Op, actor: Actor, prev?: EntityMap[K], next?: EntityMap[K]) {
  const task = entity === 'checkins' && next ? await db().tasks.get((next as Checkin).taskId) : null
  if (!authorize(entity, { actor, op, prev, task })) {
    throw new ApiError('FORBIDDEN', '没有权限执行此操作')
  }
}

interface WriteOp {
  entity: EntityName
  op: MutationOp
  rec: AnyEntity
}

async function commit(ops: WriteOp[]): Promise<void> {
  const d = db()
  const tables = [...new Set(ops.map((o) => o.entity))].map((n) => d.table(n))
  await d.transaction('rw', [...tables, d.outbox], async () => {
    for (const { entity, op, rec } of ops) {
      if (op === 'put') {
        await d.table(entity).put(rec)
      } else {
        await d.table(entity).delete(rec.id)
      }
      await d.outbox.add({ mid: uid(), entity, op, id: rec.id, data: op === 'put' ? rec : null, at: Date.now() })
    }
  })
  ctx?.onWrite()
}

function envelopeFor(actor: Actor, id?: ID) {
  const now = Date.now()
  return {
    id: id ?? uid(), familyId: actor.familyId, createdBy: actor.userId, createdAt: now,
    updatedBy: actor.userId, updatedAt: now, deleted: 0 as const, seq: 0,
  }
}

export async function createMany<K extends EntityName>(entity: K, drafts: Draft<EntityMap[K]>[]): Promise<EntityMap[K][]> {
  const actor = actorOrThrow()
  const recs = drafts.map((d) => plain({ ...d, ...envelopeFor(actor, d.id) }) as unknown as EntityMap[K])
  for (const rec of recs) {
    await guard(entity, 'create', actor, undefined, rec)
  }
  await commit(recs.map((rec) => ({ entity, op: 'put' as const, rec })))
  return recs
}

export async function create<K extends EntityName>(entity: K, draft: Draft<EntityMap[K]>): Promise<EntityMap[K]> {
  return (await createMany(entity, [draft]))[0]
}

export async function update<K extends EntityName>(entity: K, patch: Patch<EntityMap[K]>): Promise<EntityMap[K]> {
  const actor = actorOrThrow()
  const prev = await db().entity(entity).get(patch.id)
  if (!prev) {
    throw new ApiError('NOT_FOUND', '记录不存在或已被删除')
  }
  await guard(entity, 'update', actor, prev)
  const rec = plain({ ...prev, ...patch, updatedBy: actor.userId, updatedAt: Date.now() }) as EntityMap[K]
  await commit([{ entity, op: 'put', rec }])
  return rec
}

export async function removeMany<K extends EntityName>(entity: K, ids: ID[]): Promise<void> {
  const actor = actorOrThrow()
  const prevs = (await db().entity(entity).bulkGet(ids)).filter((x): x is EntityMap[K] => !!x)
  for (const prev of prevs) {
    await guard(entity, 'delete', actor, prev)
  }
  if (prevs.length) {
    await commit(prevs.map((rec) => ({ entity, op: 'del' as const, rec })))
  }
}

export async function remove<K extends EntityName>(entity: K, id: ID): Promise<void> {
  await removeMany(entity, [id])
}
