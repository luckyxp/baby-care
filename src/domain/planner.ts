/* ============================================================================
 *  每日计划生成器 · Planner
 * ----------------------------------------------------------------------------
 *  输入：宝宝档案 + 日期   输出：当日计划（喂养 / 日间早教 / 日间亲子 / 晚间亲子）
 *
 *    月龄 ──▶ 阶段方案(stageOf) ──▶ 喂养作息（育儿嫂自定义优先）
 *      │
 *      └──▶ 素材库按月龄过滤 ──▶ 以"出生天数"为种子轮换选取
 *                                  · 同一天多次生成结果完全一致（幂等）
 *                                  · 相邻两天自然错开，避免天天重复
 *
 *  自动生成的计划与任务使用确定性 ID，多台设备同时生成也只会得到同一份计划。
 * ========================================================================== */

import { EDU_KEYS } from '@/shared/constants'
import type {
  Baby, CareLog, DateKey, EduCategory, FeedKind, LogType, Plan, PlanTask, ScheduleSlot, Slot,
} from '@/shared/types'
import { eduFor, findLibraryItem, interactionsFor, recipesFor, stageOf, type EduActivity, type Interaction, type Recipe } from '@/library'
import type { Draft } from '@/db/repo'
import { ageOf, atTime, dayjs } from '@/utils/time'

export const planIdOf = (babyId: string, date: DateKey) => `plan:${babyId}:${date}`
const autoId = (babyId: string, date: DateKey, key: string) => `task:${babyId}:${date}:${key}`

/** 每日推荐量 */
const EDU_PER_CATEGORY = 1
const DAY_INTERACTIONS = 1
const EVENING_INTERACTIONS = 2

/** 喂养任务与日志类型的对应关系（用于自动匹配完成情况） */
export const FEED_LOG_TYPE: Record<FeedKind, LogType> = {
  milk: 'milk',
  solid: 'solid',
  supplement: 'medicine',
  water: 'other',
}

/** 19:00 之后与 6:00 之前的时点归入晚间 */
export const slotOfTime = (time: string): Slot => (time >= '06:00' && time < '19:00' ? 'day' : 'evening')

export interface PlanBundle {
  plan: Draft<Plan>
  tasks: Draft<PlanTask>[]
}

function rotate<T>(list: T[], seed: number, count: number): T[] {
  const n = Math.min(count, list.length)
  return Array.from({ length: n }, (_, i) => list[(seed + i) % list.length])
}

/* ── 任务构造 ───────────────────────────────────────────────────────────── */

export function feedingTask(baby: Baby, date: DateKey, slot: ScheduleSlot, order: number, id?: string, recipe?: Recipe): Draft<PlanTask> {
  return {
    id, babyId: baby.id, date, kind: 'feeding', category: slot.kind, slot: slotOfTime(slot.time), assignee: 'nanny',
    time: slot.time, title: recipe?.name ?? slot.title, desc: recipe?.tip ?? '', steps: recipe?.steps ?? [], sourceId: recipe?.id ?? null, amount: slot.amount, order,
  }
}

export function activityTask(
  baby: Baby, date: DateKey, item: EduActivity | Interaction, slot: Slot, order: number, id?: string,
): Draft<PlanTask> {
  const isEdu = !('slot' in item)
  return {
    id, babyId: baby.id, date,
    kind: isEdu ? 'edu' : 'interaction',
    category: item.category,
    slot,
    assignee: slot === 'evening' ? 'parent' : 'nanny',
    time: null, title: item.title, desc: item.goal, steps: item.steps, sourceId: item.id, amount: null, order,
  }
}

/* ── 推荐计划 ───────────────────────────────────────────────────────────── */

/**
 * @param variant 0 = 当天默认推荐（确定性 ID）；>0 = "换一批"，使用新的随机 ID
 */
export function recommendPlan(baby: Baby, date: DateKey, variant = 0): PlanBundle {
  const age = ageOf(baby.birthday, date)
  const stage = stageOf(age.monthsFloat)
  const seed = planSeed(age.totalDays, date, variant)
  const id = (key: string) => (variant === 0 ? autoId(baby.id, date, key) : undefined)
  const tasks: Draft<PlanTask>[] = []

  const schedule = baby.schedule ?? stage.schedule
  let solidIndex = 0
  schedule.forEach((slot, i) => {
    const recipe = slot.kind === 'solid' ? recipeForSlot(recipesFor(age.monthsFloat), slot, seed, solidIndex++) : undefined
    tasks.push(feedingTask(baby, date, slot, i, id(`feed${i}`), recipe))
  })

  EDU_KEYS.forEach((cat, ci) => {
    rotate(eduFor(age.monthsFloat, cat), seed, EDU_PER_CATEGORY).forEach((item, i) =>
      tasks.push(activityTask(baby, date, item, 'day', 100 + ci * 10 + i, id(`edu-${cat}-${i}`))),
    )
  })
  rotate(interactionsFor(age.monthsFloat, 'day'), seed, DAY_INTERACTIONS).forEach((item, i) =>
    tasks.push(activityTask(baby, date, item, 'day', 200 + i, id(`day-${i}`))),
  )
  rotate(interactionsFor(age.monthsFloat, 'evening'), seed, EVENING_INTERACTIONS).forEach((item, i) =>
    tasks.push(activityTask(baby, date, item, 'evening', 300 + i, id(`eve-${i}`))),
  )

  return {
    plan: { id: planIdOf(baby.id, date), babyId: baby.id, date, stageKey: stage.key, focus: stage.focus },
    tasks,
  }
}

function recipeForSlot(pool: Recipe[], slot: ScheduleSlot, seed: number, index: number): Recipe | undefined {
  const snack = /点心|加餐/.test(slot.title)
  const candidates = pool.filter((recipe) => recipe.meal === (snack ? 'snack' : 'main'))
  return rotate(candidates.length ? candidates : pool, seed + index * 7, 1)[0]
}

/**
 * 周一至周五按周模板选题：同一周内每天对应不同素材，下周再向后轮换一组。
 * 周末保留日期轮换，让家庭可以把它作为较轻松的自由活动日。
 */
function planSeed(totalDays: number, date: DateKey, variant: number): number {
  if (variant) {
    return totalDays + variant * 3
  }
  const weekday = dayjs(date).day()
  if (weekday === 0 || weekday === 6) {
    return totalDays
  }
  const monday = dayjs(date).subtract(weekday - 1, 'day')
  const week = Math.floor(monday.diff('2000-01-03', 'day') / 7)
  return week * 5 + weekday - 1
}

/** "换一个"：同领域 / 同时段里挑一个当前计划中没有的活动 */
export function swapCandidate(task: PlanTask, months: number, taken: Set<string>): EduActivity | Interaction | null {
  const pool: (EduActivity | Interaction)[] = task.kind === 'edu'
    ? eduFor(months, task.category as EduCategory)
    : interactionsFor(months, task.slot)
  const fresh = pool.filter((x) => !taken.has(x.id))
  if (!fresh.length) {
    return null
  }
  const at = task.sourceId ? pool.findIndex((x) => x.id === task.sourceId) : -1
  return fresh.find((_, i) => i > at) ?? fresh[0]
}

/** 把当日喂养任务保存为默认作息 */
export function scheduleFromTasks(tasks: PlanTask[]): ScheduleSlot[] {
  return tasks
    .filter((t) => t.kind === 'feeding' && t.time)
    .sort((a, b) => a.time!.localeCompare(b.time!))
    .map((t) => ({ time: t.time!, kind: t.category as FeedKind, title: t.title, amount: t.amount }))
}

/* ── 喂养完成度：日志自动匹配计划时点 ──────────────────────────────────── */

const MATCH_WINDOW = 90 * 60 * 1000

/** 补剂按名称匹配、全天有效（维D 什么时候喂都算）；喝水按标题匹配；奶与辅食按时间窗口 */
function candidate(t: PlanTask, l: CareLog, at: number): boolean {
  if (l.type !== FEED_LOG_TYPE[t.category as FeedKind] || l.taskId) {
    return false
  }
  if (t.category === 'supplement') {
    const name = (l as CareLog<'medicine'>).data.name
    return !!name && t.title.includes(name.replace(/[（(].*$/, ''))
  }
  if (t.category === 'water') {
    return (l as CareLog<'other'>).data.title.includes('水') && Math.abs(l.time - at) <= MATCH_WINDOW
  }
  return Math.abs(l.time - at) <= MATCH_WINDOW
}

/**
 * 喂养任务无需单独打卡：
 *   1. 日志带 taskId 的直接对应；
 *   2. 其余按"同类型 + 时间最近"贪心匹配，每条日志最多匹配一个任务。
 */
export function matchFeeding(tasks: PlanTask[], logs: CareLog[]): Map<string, CareLog> {
  const out = new Map<string, CareLog>()
  const used = new Set<string>()
  const feeding = tasks.filter((t) => t.kind === 'feeding')

  for (const t of feeding) {
    const linked = logs.find((l) => l.taskId === t.id)
    if (linked) {
      out.set(t.id, linked)
      used.add(linked.id)
    }
  }
  const open = feeding.filter((t) => !out.has(t.id) && t.time).sort((a, b) => a.time!.localeCompare(b.time!))
  for (const t of open) {
    const at = atTime(t.date, t.time!)
    let best: CareLog | null = null
    for (const l of logs) {
      if (used.has(l.id) || !candidate(t, l, at)) {
        continue
      }
      if (!best || Math.abs(l.time - at) < Math.abs(best.time - at)) {
        best = l
      }
    }
    if (best) {
      out.set(t.id, best)
      used.add(best.id)
    }
  }
  return out
}

/** 任务的素材详情（材料、时长、观察要点等），自定义任务返回 undefined */
export const libraryOf = (task: Pick<PlanTask, 'sourceId'>) => (task.sourceId ? findLibraryItem(task.sourceId) : undefined)
