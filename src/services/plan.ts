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
  Baby, Checkin, DateKey, EduCategory, FeedKind, PlanTask, PlanTemplate, Rating, Slot, TaskKind,
} from '@/shared/types'
import { type EduActivity, type Interaction, type Recipe } from '@/library'
import {
  FEED_LOG_TYPE, activityTask, matchFeeding, planIdOf, recommendPlan, scheduleFromTasks, slotOfTime,
  swapCandidate,
} from '@/domain/planner'
import { db } from '@/db/client'
import { useSession } from '@/stores/session'
import { create, createMany, remove, removeMany, update, type Draft, type Patch } from '@/db/repo'
import type { LogInput } from './logs'
import { atTime, dayjs, todayKey } from '@/utils/time'

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
  }).finally(() => inflight.delete(key))
  inflight.set(key, job)
  return job
}

/** 版本升级时移除旧版自动填充内容，手工任务保持不变。 */
export async function clearLegacyAutoTasks(baby: Baby, date: DateKey): Promise<void> {
  const tasks = await tasksOf(baby.id, date)
  const stale = tasks.filter((task) => task.id.startsWith(`task:${baby.id}:${date}:`))
  if (!stale.length) return
  const checkins = await checkinsOf(baby.id, date)
  await removeMany('checkins', checkins.filter((checkin) => stale.some((task) => task.id === checkin.taskId)).map((checkin) => checkin.id))
  await removeMany('tasks', stale.map((task) => task.id))
}

/** 应用模板会替换选中日期所在周的全部安排，由界面在调用前明确确认。 */
export async function applyTemplate(baby: Baby, date: DateKey, template?: PlanTemplate): Promise<void> {
  const monday = dayjs(date).subtract((dayjs(date).day() + 6) % 7, 'day')
  for (let weekday = 1; weekday <= 7; weekday++) {
    const target = monday.add(weekday - 1, 'day').format('YYYY-MM-DD')
    const d = db()
    await d.transaction('rw', [d.plans, d.tasks, d.checkins, d.outbox], async () => {
    const [tasks, checkins] = await Promise.all([tasksOf(baby.id, target), checkinsOf(baby.id, target)])
    await removeMany('checkins', checkins.map((checkin) => checkin.id))
    await removeMany('tasks', tasks.map((task) => task.id))
    const bundle = recommendPlan(baby, target)
    const planId = planIdOf(baby.id, target)
    if (await d.plans.get(planId)) {
      await update('plans', { id: planId, stageKey: bundle.plan.stageKey, focus: bundle.plan.focus })
    } else {
      await createMany('plans', [bundle.plan])
    }
    const drafts = template
      ? template.tasks.filter((task) => task.weekday === dayjs(target).day()).map((task) => ({
        babyId: baby.id, date: target, kind: task.kind, category: task.category, slot: task.slot,
        assignee: task.slot === 'evening' ? 'parent' as const : 'nanny' as const,
        time: task.time, title: task.title, desc: task.desc, steps: task.steps, sourceId: task.sourceId, amount: task.amount, order: task.order,
      }))
      : bundle.tasks.map(({ id: _id, ...task }) => task)
    if (drafts.length) {
      await createMany('tasks', drafts)
    }
    })
  }
}

/** 保存完整周期模板；每条安排须明确属于周一至周日中的一天。 */
export async function saveWeeklyTemplate(baby: Baby, name: string, tasks: PlanTemplate['tasks'], id?: string): Promise<void> {
  const title = name.trim()
  if (!title) throw new ApiError('INVALID', '请填写模板名称')
  if (!tasks.length) throw new ApiError('INVALID', '请至少添加一条周期安排')
  if (tasks.some((task) => task.weekday < 0 || task.weekday > 6 || !task.title.trim())) throw new ApiError('INVALID', '模板安排不完整')
  if (id) {
    await update('templates', { id, name: title, tasks })
  } else {
    await create('templates', { babyId: baby.id, name: title, tasks })
  }
}

/**
 * 宝宝生日调整后，同步今天及未来的系统默认任务。
 * 已打卡任务、手工新增任务和育儿嫂保存的自定义作息均保持原样。
 */
export async function refreshUpcomingPlans(baby: Baby): Promise<number> {
  const today = todayKey()
  const d = db()
  const plans = await d.plans.toArray()
  const targets = plans.filter((plan) => plan.babyId === baby.id && plan.date >= today)

  for (const plan of targets) {
    await d.transaction('rw', [d.plans, d.tasks, d.checkins, d.outbox], async () => {
      const [tasks, checkins] = await Promise.all([tasksOf(baby.id, plan.date), checkinsOf(baby.id, plan.date)])
      const completed = new Set(checkins.map((checkin) => checkin.taskId))
      const systemId = (id: string) => id.startsWith(`task:${baby.id}:${plan.date}:`)
      const stale = tasks.filter((task) => systemId(task.id) && !completed.has(task.id))
      const keptIds = new Set(tasks.filter((task) => completed.has(task.id)).map((task) => task.id))
      const bundle = recommendPlan(baby, plan.date)
      const fresh = bundle.tasks.filter((task) => !keptIds.has(task.id!))

      await removeMany('tasks', stale.map((task) => task.id))
      await update('plans', { id: plan.id, stageKey: bundle.plan.stageKey, focus: bundle.plan.focus })
      if (fresh.length) {
        await createMany('tasks', fresh)
      }
    })
  }
  return targets.length
}

/** 切换日期时为默认作息补齐当天辅食菜单；不改自定义作息和已经记录的餐次。 */
export async function refreshDefaultMeals(baby: Baby, date: DateKey): Promise<void> {
  if (baby.schedule || date < todayKey()) {
    return
  }
  const tasks = await tasksOf(baby.id, date)
  const expected = recommendPlan(baby, date).tasks.filter((task) => task.kind === 'feeding' && task.category === 'solid')
  const logs = await db().logs.where('[babyId+date]').equals([baby.id, date]).toArray()
  const matched = matchFeeding(tasks, logs)

  for (const fresh of expected) {
    const current = tasks.find((task) => task.id === fresh.id)
    if (!current || matched.has(current.id) || current.sourceId === fresh.sourceId) {
      continue
    }
    await update('tasks', {
      id: current.id, title: fresh.title, desc: fresh.desc, steps: fresh.steps, sourceId: fresh.sourceId,
    })
  }
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
    const fresh = recommendPlan(baby, date).tasks
      .filter((task) => task.kind === 'feeding' && !keptSlots.has(`${task.category}:${task.time}`))
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
