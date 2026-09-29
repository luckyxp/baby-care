/* ============================================================================
 *  计划模块的业务操作（均经 repo 写入：权限预检 + 乐观落库 + 离线队列）
 * ----------------------------------------------------------------------------
 *  自动生成   ensurePlan        今天及未来、本地尚无计划时按月龄方案生成
 *  批量调整   regenerate        换一批早教与亲子（保留喂养与已打卡任务）
 *             resetFeeding      按默认作息重建未完成的喂养任务
 *             saveAsDefaultSchedule  把当天喂养时点存为宝宝默认作息
 *  单条调整   swapTask / addFromLibrary / addCustomTask / updateTask / removeTask
 *  打卡       checkin / undoCheckin
 * ========================================================================== */

import { EDU_KEYS, MEDICINE_PRESETS } from '@/shared/constants'
import { ApiError } from '@/shared/errors'
import type {
  Baby, Checkin, DateKey, EduCategory, FeedKind, PlanTask, Rating, Slot, TaskKind,
} from '@/shared/types'
import { stageOf, type EduActivity, type Interaction, type Recipe } from '@/library'
import {
  FEED_LOG_TYPE, activityTask, feedingTask, matchFeeding, planIdOf, recommendPlan, scheduleFromTasks, slotOfTime,
  swapCandidate,
} from '@/domain/planner'
import { db } from '@/db/client'
import { useSession } from '@/stores/session'
import { create, createMany, remove, removeMany, update, type Draft, type Patch } from '@/db/repo'
import type { LogInput } from './logs'
import { ageOf, atTime, todayKey } from '@/utils/time'

export type LibraryPick = EduActivity | Interaction | Recipe

export const isRecipe = (item: LibraryPick): item is Recipe => 'ingredients' in item

const tasksOf = (babyId: string, date: DateKey) => db().tasks.where('[babyId+date]').equals([babyId, date]).toArray()
const checkinsOf = (babyId: string, date: DateKey) => db().checkins.where('[babyId+date]').equals([babyId, date]).toArray()

async function nextOrder(babyId: string, date: DateKey): Promise<number> {
  const tasks = await tasksOf(babyId, date)
  return tasks.reduce((m, t) => Math.max(m, t.order), 0) + 1
}

/* ── 自动生成 ────────────────────────────────────────────────────────────── */

const inflight = new Map<string, Promise<void>>()

/** 仅育儿嫂可触发；过去日期不自动生成。计划、任务和队列在同一本地事务写入。 */
export function ensurePlan(baby: Baby, date: DateKey): Promise<void> {
  if (date < todayKey() || !useSession().isAdmin) {
    return Promise.resolve()
  }
  const id = planIdOf(baby.id, date)
  const key = `${db().name}:${id}`
  const running = inflight.get(key)
  if (running) {
    return running
  }
  const d = db()
  const job = d.transaction('rw', [d.plans, d.tasks, d.outbox], async () => {
    const [plan, tasks] = await Promise.all([db().plans.get(id), tasksOf(baby.id, date)])
    if (plan || tasks.length) {
      return
    }
    const bundle = recommendPlan(baby, date)
    await createMany('plans', [bundle.plan])
    await createMany('tasks', bundle.tasks)
  }).finally(() => inflight.delete(key))
  inflight.set(key, job)
  return job
}

/* ── 批量调整 ───────────────────────────────────────────────────────────── */

export async function regenerate(baby: Baby, date: DateKey): Promise<void> {
  const d = db()
  await d.transaction('rw', [d.tasks, d.checkins, d.outbox], async () => {
    const [tasks, checkins] = await Promise.all([tasksOf(baby.id, date), checkinsOf(baby.id, date)])
    const done = new Set(checkins.map((c) => c.taskId))
    const stale = tasks.filter((t) => t.kind !== 'feeding' && !done.has(t.id))
    const kept = tasks.filter((t) => t.kind !== 'feeding' && done.has(t.id))
    const taken = new Set(kept.map((t) => t.sourceId))
    // 已完成的任务占据当天推荐名额，避免“换一批”导致任务数越换越多。
    const bucket = (t: Pick<PlanTask, 'kind' | 'category' | 'slot'>) =>
      `${t.kind}:${t.slot}:${t.kind === 'edu' ? t.category : ''}`
    const occupied = new Map<string, number>()
    for (const t of kept) {
      const key = bucket(t)
      occupied.set(key, (occupied.get(key) ?? 0) + 1)
    }
    const variant = 1 + Math.floor(Math.random() * 999)
    const fresh = recommendPlan(baby, date, variant).tasks.filter((t) => {
      if (t.kind === 'feeding') {
        return false
      }
      const key = bucket(t)
      const count = occupied.get(key) ?? 0
      if (count) {
        occupied.set(key, count - 1)
        return false
      }
      return !taken.has(t.sourceId)
    })
    await removeMany('tasks', stale.map((t) => t.id))
    if (fresh.length) {
      await createMany('tasks', fresh)
    }
  })
}

export async function resetFeeding(baby: Baby, date: DateKey): Promise<void> {
  const d = db()
  await d.transaction('rw', [d.tasks, d.logs, d.outbox], async () => {
    const [tasks, logs] = await Promise.all([
      tasksOf(baby.id, date), d.logs.where('[babyId+date]').equals([baby.id, date]).toArray(),
    ])
    const matched = matchFeeding(tasks, logs)
    const feeding = tasks.filter((t) => t.kind === 'feeding')
    const kept = feeding.filter((t) => matched.has(t.id))
    const keptSlots = new Set(kept.map((t) => `${t.category}:${t.time}`))
    const schedule = baby.schedule ?? stageOf(ageOf(baby.birthday, date).monthsFloat).schedule
    const fresh = schedule.filter((s) => !keptSlots.has(`${s.kind}:${s.time}`))
      .map((s, i) => feedingTask(baby, date, s, i))
    await removeMany('tasks', feeding.filter((t) => !matched.has(t.id)).map((t) => t.id))
    if (fresh.length) {
      await createMany('tasks', fresh)
    }
  })
}

export async function saveAsDefaultSchedule(baby: Baby, tasks: PlanTask[]): Promise<void> {
  const schedule = scheduleFromTasks(tasks)
  if (!schedule.length) {
    throw new ApiError('INVALID', '当天没有带时间的喂养任务')
  }
  await update('babies', { id: baby.id, schedule })
}

/* ── 单条调整 ───────────────────────────────────────────────────────────── */

export async function swapTask(task: PlanTask, months: number, taken: Set<string>): Promise<PlanTask> {
  const next = swapCandidate(task, months, taken)
  if (!next) {
    throw new ApiError('NOT_FOUND', '素材库里没有更多同类活动了')
  }
  return update('tasks', {
    id: task.id, title: next.title, desc: next.goal, steps: next.steps, sourceId: next.id, category: next.category,
  })
}

export async function addFromLibrary(baby: Baby, date: DateKey, item: LibraryPick, slot: Slot): Promise<PlanTask> {
  const order = await nextOrder(baby.id, date)
  if (isRecipe(item)) {
    return create('tasks', {
      babyId: baby.id, date, kind: 'feeding', category: 'solid', slot: 'day', assignee: 'nanny', time: null,
      title: item.name, desc: item.tip, steps: item.steps, sourceId: item.id, amount: null, order,
    })
  }
  return create('tasks', activityTask(baby, date, item, slot, order))
}

export interface TaskInput {
  kind: TaskKind
  category: FeedKind | EduCategory | null
  slot: Slot
  title: string
  desc: string
  steps: string[]
  time: string | null
  amount: number | null
}

/** 喂养任务的时段由时间推导、始终由育儿嫂执行；晚间活动留给家长 */
function normalize(input: TaskInput): Omit<TaskInput, 'kind'> & { assignee: PlanTask['assignee'] } {
  const feeding = input.kind === 'feeding'
  const categories = feeding ? ['milk', 'solid', 'supplement', 'water'] : EDU_KEYS
  if (!input.title.trim() || !input.category || !(categories as readonly string[]).includes(input.category)) {
    throw new ApiError('INVALID', '请填写任务名称并选择正确类别')
  }
  if (input.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time)) {
    throw new ApiError('INVALID', '时间格式应为 HH:mm')
  }
  if (input.amount !== null && (!Number.isFinite(input.amount) || input.amount < 0 || input.amount > 400)) {
    throw new ApiError('INVALID', '计划量应在 0-400ml 之间')
  }
  const slot = feeding && input.time ? slotOfTime(input.time) : input.slot
  return {
    category: input.category,
    slot,
    assignee: !feeding && slot === 'evening' ? 'parent' : 'nanny',
    title: input.title.trim(),
    desc: input.desc.trim(),
    steps: input.steps.map((s) => s.trim()).filter(Boolean),
    time: input.time || null,
    amount: feeding && (input.category === 'milk' || input.category === 'water') ? input.amount : null,
  }
}

export async function addCustomTask(baby: Baby, date: DateKey, input: TaskInput): Promise<PlanTask> {
  const draft: Draft<PlanTask> = {
    babyId: baby.id, date, kind: input.kind, ...normalize(input), sourceId: null, order: await nextOrder(baby.id, date),
  }
  return create('tasks', draft)
}

export function updateTask(task: PlanTask, input: TaskInput): Promise<PlanTask> {
  const patch: Patch<PlanTask> = { id: task.id, ...normalize({ ...input, kind: task.kind }) }
  return update('tasks', patch)
}

export async function removeTask(task: PlanTask): Promise<void> {
  const d = db()
  await d.transaction('rw', [d.tasks, d.checkins, d.outbox], async () => {
    // 先校验并删除任务，避免无任务管理权的人先删掉关联打卡。
    await remove('tasks', task.id)
    const checkins = await d.checkins.where('taskId').equals(task.id).toArray()
    if (checkins.length) {
      await removeMany('checkins', checkins.map((c) => c.id))
    }
  })
}

/* ── 打卡 ───────────────────────────────────────────────────────────────── */

export interface CheckinInput {
  rating: Rating
  tags: string[]
  note: string
  duration: number | null
}

export async function checkin(task: PlanTask, input: CheckinInput): Promise<Checkin> {
  if (task.date > todayKey()) {
    throw new ApiError('INVALID', '未来任务暂时不能打卡')
  }
  const d = db()
  return d.transaction('rw', [d.tasks, d.checkins, d.outbox], async () => {
    const existing = await d.checkins.where('taskId').equals(task.id).first()
    if (existing) {
      throw new ApiError('CONFLICT', '该任务已经打卡')
    }
    return create('checkins', {
    babyId: task.babyId, date: task.date, taskId: task.id, kind: task.kind, category: task.category, slot: task.slot,
    rating: input.rating, tags: input.tags, note: input.note.trim(), duration: input.duration,
    })
  })
}

export function undoCheckin(ck: Checkin): Promise<void> {
  return remove('checkins', ck.id)
}

/* ── 喂养任务 → 日志预填 ────────────────────────────────────────────────── */

export function feedingPreset(task: PlanTask): Partial<LogInput> {
  const kind = task.category as FeedKind
  const base = {
    type: FEED_LOG_TYPE[kind], taskId: task.id, source: 'task' as const,
    time: task.date < todayKey() ? atTime(task.date, task.time ?? '12:00') : Date.now(),
  }
  switch (kind) {
    case 'milk':
      return { ...base, data: { amount: task.amount ?? 120 } as LogInput['data'] }
    case 'supplement': {
      const name = MEDICINE_PRESETS.find((m) => task.title.includes(m)) ?? task.title.split(/\s+/)[0]
      return { ...base, data: { name, dose: task.title.replace(name, '').trim() } as LogInput['data'] }
    }
    case 'water':
      return { ...base, data: { title: '喝水' } as LogInput['data'], note: task.amount ? `约 ${task.amount}ml` : '' }
    case 'solid':
      return { ...base, note: task.sourceId ? task.title : '' }
  }
}
