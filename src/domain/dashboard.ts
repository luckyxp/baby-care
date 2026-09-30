/* ============================================================================
 *  数据看板 · 区间聚合
 * ----------------------------------------------------------------------------
 *  在 stats.ts 的"单日口径"之上做日 / 周 / 月聚合：
 *
 *    days ──过滤未来日期──▶ perDay(summarizeDay) ──▶ totals ──÷ 有记录天数──▶ averages
 *                                                    │
 *    tasks + checkins ──▶ summarizeEdu ──▶ 五大领域频次、日间/晚间亲子完成率
 *
 *  日均按"有记录的天数"计算：宝宝刚出生、中途开始使用、周/月未过完时都不会被
 *  空白天数拉低。
 * ========================================================================== */

import { EDU_KEYS } from '@/shared/constants'
import type { CareLog, Checkin, DateKey, EduCategory, PlanTask } from '@/shared/types'
import { abnormalReason, isFever } from './log-kinds'
import { summarizeDay, summarizeEdu, type DaySummary, type EduSummary } from './stats'

export interface RangeTotals {
  milkMl: number
  bottleCount: number
  breastCount: number
  breastMin: number
  solidCount: number
  pee: number
  poop: number
  abnormalPoop: number
  sleepMin: number
  napCount: number
  napMin: number
  tempCount: number
  feverCount: number
  tempMax: number | null
  medicineCount: number
}

export interface RangeAverages {
  milkMl: number
  bottleCount: number
  solidCount: number
  pee: number
  poop: number
  sleepMin: number
  napMin: number
}

export interface RangeSummary {
  /** 纳入统计的日期（不含未来） */
  days: DateKey[]
  perDay: DaySummary[]
  /** 有任意记录的天数，日均的分母 */
  activeDays: number
  totals: RangeTotals
  averages: RangeAverages
  longestSleepMin: number
  /** 区间内吃过的全部食材 */
  foods: string[]
  /** 区间内首次尝试的食材（区间之前从未出现过） */
  newFoods: string[]
  edu: EduSummary
}

export interface RangeInput {
  days: DateKey[]
  /** 需覆盖区间首日的前一天（跨夜睡眠） */
  logs: CareLog[]
  tasks: PlanTask[]
  checkins: Checkin[]
  today: DateKey
  now?: number
  /** 区间开始之前已经吃过的食材 */
  priorFoods?: Iterable<string>
}

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0)

export function summarizeRange(input: RangeInput): RangeSummary {
  const now = input.now ?? Date.now()
  const days = input.days.filter((d) => d <= input.today)
  const inRange = new Set(days)
  const logs = input.logs.filter((l) => inRange.has(l.date))
  const perDay = days.map((d) => summarizeDay(d, input.logs, now))
  const active = new Set(logs.map((l) => l.date))
  const activeDays = active.size
  const div = Math.max(1, activeDays)
  const pick = (k: keyof DaySummary) => sum(perDay.map((d) => d[k] as number))

  const temps = logs.filter((l): l is CareLog<'temp'> => l.type === 'temp')
  const poops = logs.filter((l): l is CareLog<'diaper'> => l.type === 'diaper').filter((l) => l.data.kind !== 'pee')

  const totals: RangeTotals = {
    milkMl: pick('milkMl'),
    bottleCount: pick('bottleCount'),
    breastCount: pick('breastCount'),
    breastMin: pick('breastMin'),
    solidCount: pick('solidCount'),
    pee: pick('pee'),
    poop: pick('poop'),
    abnormalPoop: poops.filter((l) => abnormalReason(l)).length,
    sleepMin: pick('sleepMin'),
    napCount: pick('napCount'),
    napMin: pick('napMin'),
    tempCount: temps.length,
    feverCount: temps.filter(isFever).length,
    tempMax: temps.length ? Math.max(...temps.map((l) => l.data.value)) : null,
    medicineCount: logs.filter((l) => l.type === 'medicine').length,
  }

  // 睡眠日均只统计有睡眠记录的天，避免"只记了奶没记睡"的日子拉低均值
  const sleepDays = Math.max(1, perDay.filter((d) => d.sleepMin > 0).length)
  const averages: RangeAverages = {
    milkMl: Math.round(totals.milkMl / div),
    bottleCount: Math.round((totals.bottleCount / div) * 10) / 10,
    solidCount: Math.round((totals.solidCount / div) * 10) / 10,
    pee: Math.round((totals.pee / div) * 10) / 10,
    poop: Math.round((totals.poop / div) * 10) / 10,
    sleepMin: Math.round(totals.sleepMin / sleepDays),
    napMin: Math.round(totals.napMin / sleepDays),
  }

  const foods = [...new Set(perDay.flatMap((d) => d.foods))]
  const prior = new Set(input.priorFoods ?? [])

  return {
    days,
    perDay,
    activeDays,
    totals,
    averages,
    // 区间内的"最长一觉"按整段睡眠计（跨夜不截断、起点可早于区间首日），与单日卡片的"当日口径"相区别
    longestSleepMin: Math.max(0, ...input.logs.filter((l) => l.type === 'sleep').map((l) => ((l.endTime ?? now) - l.time) / 60000)),
    foods,
    newFoods: foods.filter((f) => !prior.has(f)),
    edu: summarizeEdu(
      input.tasks.filter((t) => inRange.has(t.date)),
      input.checkins.filter((c) => inRange.has(c.date)),
    ),
  }
}

/* ── 五大领域排行 ───────────────────────────────────────────────────────── */

export interface CategoryRank {
  most: EduCategory[]
  least: EduCategory[]
}

/** 按完成次数排序，返回并列最多 / 最少的领域；全部为 0 时返回空 */
export function rankCategories(edu: EduSummary): CategoryRank {
  const counts = EDU_KEYS.map((k) => [k, edu.byCategory[k].done] as const)
  const max = Math.max(...counts.map(([, n]) => n))
  const min = Math.min(...counts.map(([, n]) => n))
  if (max === 0) {
    return { most: [], least: [] }
  }
  return {
    most: counts.filter(([, n]) => n === max).map(([k]) => k),
    least: max === min ? [] : counts.filter(([, n]) => n === min).map(([k]) => k),
  }
}
