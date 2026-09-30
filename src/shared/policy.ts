/* ============================================================================
 *  权限策略 · Access Policy
 * ----------------------------------------------------------------------------
 *  "云端校验"与"界面置灰"共用同一张规则表 —— 前端只是提前告诉用户结果，
 *  真正的裁决永远发生在云端（模拟云 / 未来的真实后端）。
 *
 *    ┌──────────┬─────────────────────┬────────────────────────────────────┐
 *    │ 实体      │ 育儿嫂（admin）       │ 家长（parent）                      │
 *    ├──────────┼─────────────────────┼────────────────────────────────────┤
 *    │ 宝宝/邀请 │ 全部                 │ 只读（邀请码不可见）                  │
 *    │ 成员      │ 改名、移除他人         │ 仅修改自己的昵称/头像                 │
 *    │ 日志      │ 全部                 │ 新增；只能改删自己录入的              │
 *    │ 备注      │ 新增、删除任意         │ 新增；只能改删自己写的                │
 *    │ 计划/任务 │ 全部                 │ 只读                                │
 *    │ 打卡      │ 全部                 │ 仅"留给家长"的晚间任务；只能撤销自己的  │
 *    │ 汇报      │ 全部                 │ 只读 + 备注                         │
 *    │ 消息      │ 仅标记自己的已读        │ 仅标记自己的已读                     │
 *    └──────────┴─────────────────────┴────────────────────────────────────┘
 * ========================================================================== */

import type { Actor, EntityMap, EntityName, PlanTask } from './types'

export type Op = 'create' | 'update' | 'delete'

export interface RuleCtx<T> {
  actor: Actor
  op: Op
  /** 更新 / 删除前的记录 */
  prev?: T
  /** 打卡规则需要的关联任务 */
  task?: PlanTask | null
}

type Rule<T> = (ctx: RuleCtx<T>) => boolean

const isAdmin = (a: Actor) => a.role === 'admin'
const owns = (a: Actor, rec?: { createdBy: string }) => !!rec && rec.createdBy === a.userId

export const POLICY: { [K in EntityName]: Rule<EntityMap[K]> } = {
  members: ({ actor, op, prev }) => {
    if (op === 'create') {
      return false // 成员只能经由邀请码加入
    }
    if (isAdmin(actor)) {
      return !(op === 'delete' && prev?.userId === actor.userId)
    }
    return op === 'update' && prev?.userId === actor.userId
  },
  invites: ({ actor, op }) => isAdmin(actor) && op !== 'create', // 邀请码由云端生成
  babies: ({ actor }) => isAdmin(actor),
  logs: ({ actor, op, prev }) => op === 'create' || isAdmin(actor) || owns(actor, prev),
  notes: ({ actor, op, prev }) => op === 'create' || owns(actor, prev) || (op === 'delete' && isAdmin(actor)),
  plans: ({ actor }) => isAdmin(actor),
  tasks: ({ actor }) => isAdmin(actor),
  checkins: ({ actor, op, prev, task }) => {
    if (isAdmin(actor)) {
      return true
    }
    return op === 'create' ? task?.assignee === 'parent' : owns(actor, prev)
  },
  reports: ({ actor }) => isAdmin(actor),
  notices: ({ actor, op, prev }) => op === 'update' && prev?.recipientId === actor.userId,
  templates: ({ actor }) => isAdmin(actor),
}

/**
 * 受限更新的字段白名单：只能改这些字段，其余字段一律以云端旧值为准。
 * 未列出的实体表示"有权即可整体更新"。
 */
export const MUTABLE_FIELDS: Partial<Record<EntityName, readonly string[]>> = {
  members: ['nickname', 'avatar'],
  notices: ['readAt'],
}

/** 可见性：未列出的实体对全体家庭成员可见 */
export const VISIBLE: { [K in EntityName]?: (actor: Actor, rec: EntityMap[K]) => boolean } = {
  invites: (actor) => isAdmin(actor),
  notices: (actor, rec) => rec.recipientId === actor.userId,
}

export function authorize<K extends EntityName>(entity: K, ctx: RuleCtx<EntityMap[K]>): boolean {
  return (POLICY[entity] as Rule<EntityMap[K]>)(ctx)
}

export function visible<K extends EntityName>(entity: K, actor: Actor, rec: EntityMap[K]): boolean {
  const rule = VISIBLE[entity] as ((a: Actor, r: EntityMap[K]) => boolean) | undefined
  return rule ? rule(actor, rec) : true
}

/* ── 界面层的语义化封装 ─────────────────────────────────────────────────── */

export const can = {
  manageFamily: (a: Actor) => isAdmin(a),
  editPlan: (a: Actor) => isAdmin(a),
  editReport: (a: Actor) => isAdmin(a),
  editLog: (a: Actor, log: EntityMap['logs']) => authorize('logs', { actor: a, op: 'update', prev: log }),
  deleteNote: (a: Actor, note: EntityMap['notes']) => authorize('notes', { actor: a, op: 'delete', prev: note }),
  checkin: (a: Actor, task: PlanTask) => authorize('checkins', { actor: a, op: 'create', task }),
  undoCheckin: (a: Actor, ck: EntityMap['checkins']) => authorize('checkins', { actor: a, op: 'delete', prev: ck }),
}
