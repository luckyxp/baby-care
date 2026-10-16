/* ============================================================================
 *  计划模块的业务操作（均经 repo 写入：权限预检 + 乐观落库 + 离线队列）
 * ----------------------------------------------------------------------------
 *  日期计划   ensurePlan        今天及未来、本地尚无计划时创建空计划
 *  日模板库   saveDailyTemplate / removeDailyTemplate / applyDailyTemplate
 *  批量调整   regenerate        换一批早教与亲子（保留喂养与已打卡任务）
 *  单条调整   swapTask / addFromLibrary / addCustomTask / updateTask / removeTask
 *  打卡       checkin / undoCheckin
 * ========================================================================== */

import { MEDICINE_PRESETS } from '@/shared/constants'
import { ApiError } from '@/shared/errors'
import type {
  Baby, Checkin, DateKey, FeedKind, PlanTask, PlanTemplate, Rating, Slot,
} from '@/shared/types'
import { stageOf, type EduActivity, type Interaction, type Recipe } from '@/library'
import { normalizeTaskInput, normalizeTemplateTasks, type TaskInput } from '@/domain/plan-task'
import {
  FEED_LOG_TYPE, activityTask, matchFeeding, planIdOf, recommendPlan,
  swapCandidate,
} from '@/domain/planner'
import { db } from '@/db/client'
import { useSession } from '@/stores/session'
import { create, createMany, remove, removeMany, update, type Draft, type Patch } from '@/db/repo'
import type { LogInput } from './logs'
import { ageOf, atTime, dayjs, todayKey } from '@/utils/time'

export type { TaskInput } from '@/domain/plan-task'

export type LibraryPick = EduActivity | Interaction | Recipe

export const isRecipe = (item: LibraryPick): item is Recipe => 'ingredients' in item

const tasksOf = (babyId: string, date: DateKey) => db().tasks.where('[babyId+date]').equals([babyId, date]).toArray()
const checkinsOf = (babyId: string, date: DateKey) => db().checkins.where('[babyId+date]').equals([babyId, date]).toArray()

async function nextOrder(babyId: string, date: DateKey): Promise<number> {
  const tasks = await tasksOf(babyId, date)
  return tasks.reduce((m, t) => Math.max(m, t.order), 0) + 1
}

/* ── 日期计划 ────────────────────────────────────────────────────────────── */

const inflight = new Map<string, Promise<void>>()

/** 仅育儿嫂可触发；只建计划容器，具体任务由日模板或手工安排。 */
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
    const stage = stageOf(ageOf(baby.birthday, date).monthsFloat)
    await create('plans', { id, babyId: baby.id, date, stageKey: stage.key, focus: stage.focus })
  }).finally(() => inflight.delete(key))
  inflight.set(key, job)
  return job
}

/* ----------------------------------------------------------------------------
 * 日模板：一次保存完整的一天；应用后各日期拥有独立任务，后续编辑互不影响。
 * -------------------------------------------------------------------------- */

export async function saveDailyTemplate(baby: Baby, name: string, tasks: PlanTemplate['tasks'], id?: string): Promise<PlanTemplate> {
  const title = name.trim()
  if (!title) throw new ApiError('INVALID', '请填写日模板名称')
  const normalized = normalizeTemplateTasks(tasks)
  if (id) {
    const previous = await db().dailyTemplates.get(id)
    if (!previous || previous.deleted || previous.babyId !== baby.id) throw new ApiError('NOT_FOUND', '日模板不存在')
    return update('dailyTemplates', { id, name: title, tasks: normalized })
  }
  return create('dailyTemplates', { babyId: baby.id, name: title, tasks: normalized })
}

export async function removeDailyTemplate(baby: Baby, id: string): Promise<void> {
  const template = await db().dailyTemplates.get(id)
  if (!template || template.deleted || template.babyId !== baby.id) throw new ApiError('NOT_FOUND', '日模板不存在')
  await remove('dailyTemplates', id)
}

/** 整批日期原子应用，只替换未完成任务；已打卡、已关联日志的任务保持原样。 */
export async function applyDailyTemplate(
  baby: Baby, dates: DateKey[], template: Pick<PlanTemplate, 'babyId' | 'name' | 'tasks'>,
): Promise<number> {
  if (template.babyId !== baby.id) throw new ApiError('INVALID', '请选择当前宝宝的日模板')
  const targets = [...new Set(dates)].sort()
  if (!targets.length) throw new ApiError('INVALID', '请至少选择一天')
  if (targets.some((date) => !/^\d{4}-\d{2}-\d{2}$/.test(date) || dayjs(date).format('YYYY-MM-DD') !== date || date < todayKey() || date < baby.birthday)) {
    throw new ApiError('INVALID', '请选择今天或之后的有效日期')
  }
  const entries = normalizeTemplateTasks(template.tasks)
  const signature = (task: PlanTask | PlanTemplate['tasks'][number]) => JSON.stringify([
    task.kind, task.category, task.slot, task.time, task.sourceId, task.title,
  ])
  const d = db()
  await d.transaction('rw', [d.plans, d.tasks, d.checkins, d.logs, d.outbox], async () => {
    for (const target of targets) {
      const [tasks, checkins, logs] = await Promise.all([
        tasksOf(baby.id, target), checkinsOf(baby.id, target),
        d.logs.where('[babyId+date]').equals([baby.id, target]).toArray(),
      ])
      const completed = new Set([
        ...checkins.map((checkin) => checkin.taskId),
        ...logs.flatMap((log) => log.taskId ? [log.taskId] : []),
        ...matchFeeding(tasks, logs).keys(),
      ])
      const retained = new Map<string, number>()
      tasks.filter((task) => completed.has(task.id)).forEach((task) => {
        const key = signature(task)
        retained.set(key, (retained.get(key) ?? 0) + 1)
      })
      await removeMany('tasks', tasks.filter((task) => !completed.has(task.id)).map((task) => task.id))

      const stage = stageOf(ageOf(baby.birthday, target).monthsFloat)
      const plan = { babyId: baby.id, date: target, stageKey: stage.key, focus: stage.focus }
      const id = planIdOf(baby.id, target)
      if (await d.plans.get(id)) await update('plans', { id, ...plan })
      else await create('plans', { id, ...plan })

      const drafts = entries.flatMap((entry) => {
        const key = signature(entry)
        const count = retained.get(key) ?? 0
        if (count) {
          retained.set(key, count - 1)
          return []
        }
        return [{ ...normalizeTaskInput(entry), babyId: baby.id, date: target, sourceId: entry.sourceId, order: entry.order }]
      })
      if (drafts.length) await createMany('tasks', drafts)
    }
  })
  return targets.length
}

/** 清空当前宝宝的护理数据与计划配置，保留档案、家庭成员和消息。 */
export async function clearCareData(baby: Baby): Promise<void> {
  const d = db()
  const [logs, notes, plans, tasks, checkins, reports, templates] = await Promise.all([
    d.logs.toArray(), d.notes.toArray(), d.plans.toArray(), d.tasks.toArray(), d.checkins.toArray(), d.reports.toArray(), d.dailyTemplates.toArray(),
  ])
  await d.transaction('rw', [d.logs, d.notes, d.plans, d.tasks, d.checkins, d.reports, d.dailyTemplates, d.outbox], async () => {
    await removeMany('checkins', checkins.filter((item) => item.babyId === baby.id).map((item) => item.id))
    await removeMany('tasks', tasks.filter((item) => item.babyId === baby.id).map((item) => item.id))
    await removeMany('plans', plans.filter((item) => item.babyId === baby.id).map((item) => item.id))
    await removeMany('reports', reports.filter((item) => item.babyId === baby.id).map((item) => item.id))
    await removeMany('notes', notes.filter((item) => item.babyId === baby.id).map((item) => item.id))
    await removeMany('logs', logs.filter((item) => item.babyId === baby.id).map((item) => item.id))
    await removeMany('dailyTemplates', templates.filter((item) => item.babyId === baby.id).map((item) => item.id))
  })
}

/** 宝宝生日调整后只更新日期计划的月龄信息，已经安排的任务内容保持独立。 */
export async function refreshUpcomingPlans(baby: Baby): Promise<number> {
  const today = todayKey()
  const d = db()
  const plans = await d.plans.toArray()
  const targets = plans.filter((plan) => plan.babyId === baby.id && plan.date >= today)

  for (const plan of targets) {
    const stage = stageOf(ageOf(baby.birthday, plan.date).monthsFloat)
    await update('plans', { id: plan.id, stageKey: stage.key, focus: stage.focus })
  }
  return targets.length
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

export async function addCustomTask(baby: Baby, date: DateKey, input: TaskInput): Promise<PlanTask> {
  const draft: Draft<PlanTask> = {
    babyId: baby.id, date, ...normalizeTaskInput(input), sourceId: null, order: await nextOrder(baby.id, date),
  }
  return create('tasks', draft)
}

export function updateTask(task: PlanTask, input: TaskInput): Promise<PlanTask> {
  const patch: Patch<PlanTask> = { id: task.id, ...normalizeTaskInput({ ...input, kind: task.kind }) }
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
