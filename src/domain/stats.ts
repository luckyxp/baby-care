/* ============================================================================
 *  统计聚合 · Stats
 * ----------------------------------------------------------------------------
 *  数据看板（日/周/月）与每日汇报共用同一套口径：
 *    · 睡眠按"与当天 00:00-24:00 的重叠时长"计入，跨夜的一觉会被拆到两天；
 *    · 白天小睡 = 入睡时刻落在 07:00-19:00 的睡眠；
 *    · 五大领域频次 = 早教 + 亲子互动中带领域标签的打卡次数。
 * ========================================================================== */

import { EDU_KEYS } from '@/shared/constants'
import type { CareLog, Checkin, DateKey, EduCategory, PlanTask } from '@/shared/types'
import { isFever } from './log-kinds'
import { dayjs } from '@/utils/time'

const MINUTE = 60_000

export interface DaySummary {
  date: DateKey
  milkMl: number
  bottleCount: number
  breastCount: number
  breastMin: number
  solidCount: number
  foods: string[]
  pee: number
  poop: number
  sleepMin: number
  napCount: number
  napMin: number
  longestSleepMin: number
  tempMax: number | null
  fever: boolean
  medicine: string[]
}

export function dayWindow(date: DateKey): [number, number] {
  const start = dayjs(date).startOf('day')
  return [start.valueOf(), start.add(1, 'day').valueOf()]
}

/** 一段睡眠落在 [from, to) 内的分钟数 */
export function overlapMinutes(log: CareLog, [from, to]: [number, number], now: number = Date.now()): number {
  const end = log.endTime ?? now
  return Math.max(0, (Math.min(end, to) - Math.max(log.time, from)) / MINUTE)
}

const isNap = (log: CareLog) => {
  const h = dayjs(log.time).hour()
  return h >= 7 && h < 19
}

/**
 * @param logs 需包含前一天的日志（用于跨夜睡眠），函数内部按日期过滤
 */
export function summarizeDay(date: DateKey, logs: CareLog[], now: number = Date.now()): DaySummary {
  const win = dayWindow(date)
  const today = logs.filter((l) => l.date === date)
  const sleeps = logs.filter((l) => l.type === 'sleep' && overlapMinutes(l, win, now) > 0)
  const milk = today.filter((l): l is CareLog<'milk'> => l.type === 'milk')
  const bottle = milk.filter((l) => l.data.mode !== 'breast')
  const breast = milk.filter((l) => l.data.mode === 'breast')
  const solids = today.filter((l): l is CareLog<'solid'> => l.type === 'solid')
  const diapers = today.filter((l): l is CareLog<'diaper'> => l.type === 'diaper')
  const temps = today.filter((l): l is CareLog<'temp'> => l.type === 'temp')
  const naps = sleeps.filter((l) => l.date === date && isNap(l))

  return {
    date,
    milkMl: bottle.reduce((s, l) => s + (l.data.amount ?? 0), 0),
    bottleCount: bottle.length,
    breastCount: breast.length,
    breastMin: breast.reduce((s, l) => s + (l.data.duration ?? 0), 0),
    solidCount: solids.length,
    foods: [...new Set(solids.flatMap((l) => l.data.foods))],
    pee: diapers.filter((l) => l.data.kind !== 'poop').length,
    poop: diapers.filter((l) => l.data.kind !== 'pee').length,
    sleepMin: Math.round(sleeps.reduce((s, l) => s + overlapMinutes(l, win, now), 0)),
    napCount: naps.length,
    napMin: Math.round(naps.reduce((s, l) => s + overlapMinutes(l, win, now), 0)),
    longestSleepMin: Math.round(Math.max(0, ...sleeps.map((l) => overlapMinutes(l, win, now)))),
    tempMax: temps.length ? Math.max(...temps.map((l) => l.data.value)) : null,
    fever: temps.some(isFever),
    medicine: [...new Set(today.filter((l): l is CareLog<'medicine'> => l.type === 'medicine').map((l) => l.data.name))],
  }
}

/* ── 早教与亲子 ─────────────────────────────────────────────────────────── */

export interface Ratio {
  done: number
  planned: number
}

export interface EduSummary {
  byCategory: Record<EduCategory, Ratio>
  edu: Ratio
  day: Ratio
  evening: Ratio
}

const ratio = (): Ratio => ({ done: 0, planned: 0 })

export function summarizeEdu(tasks: PlanTask[], checkins: Checkin[]): EduSummary {
  const out: EduSummary = {
    byCategory: Object.fromEntries(EDU_KEYS.map((k) => [k, ratio()])) as Record<EduCategory, Ratio>,
    edu: ratio(),
    day: ratio(),
    evening: ratio(),
  }
  const bucket = (x: { kind: string; slot: string }) =>
    x.kind === 'edu' ? out.edu : x.kind === 'interaction' ? (x.slot === 'evening' ? out.evening : out.day) : null

  for (const t of tasks) {
    const b = bucket(t)
    if (!b) {
      continue
    }
    b.planned++
    if (EDU_KEYS.includes(t.category as EduCategory)) {
      out.byCategory[t.category as EduCategory].planned++
    }
  }
  for (const c of checkins) {
    const b = bucket(c)
    if (!b) {
      continue
    }
    b.done++
    if (EDU_KEYS.includes(c.category as EduCategory)) {
      out.byCategory[c.category as EduCategory].done++
    }
  }
  return out
}

export const percent = (r: Ratio): number => (r.planned ? Math.round((Math.min(r.done, r.planned) / r.planned) * 100) : 0)
