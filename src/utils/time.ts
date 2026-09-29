/* ============================================================================
 *  时间与月龄
 * ----------------------------------------------------------------------------
 *  全应用统一使用本地时区；DateKey = 'YYYY-MM-DD'，字典序即时间序，
 *  可直接用于 IndexedDB 复合索引的范围查询。
 * ========================================================================== */

import dayjs, { type Dayjs } from 'dayjs'
import 'dayjs/locale/zh-cn'
import type { DateKey } from '@/shared/types'

dayjs.locale('zh-cn')

export { dayjs }

export const DATE_FMT = 'YYYY-MM-DD'
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

type TimeLike = number | Date | Dayjs | string

export const dateKey = (t: TimeLike = Date.now()): DateKey => dayjs(t).format(DATE_FMT)
export const todayKey = (): DateKey => dateKey()
export const shiftDate = (d: DateKey, n: number, unit: 'day' | 'week' | 'month' = 'day'): DateKey =>
  dayjs(d).add(n, unit).format(DATE_FMT)

export const hm = (t: number): string => dayjs(t).format('HH:mm')
export const weekday = (d: DateKey): string => WEEKDAYS[dayjs(d).day()]

/** 'HH:mm' + DateKey → 时间戳 */
export function atTime(d: DateKey, time: string): number {
  const [h, m] = time.split(':').map(Number)
  return dayjs(d).hour(h).minute(m).second(0).millisecond(0).valueOf()
}

/** 今天 / 昨天 / 9月26日 周六 */
export function dateLabel(d: DateKey, today: DateKey = todayKey()): string {
  if (d === today) {
    return '今天'
  }
  if (d === shiftDate(today, -1)) {
    return '昨天'
  }
  if (d === shiftDate(today, 1)) {
    return '明天'
  }
  const x = dayjs(d)
  const head = x.year() === dayjs(today).year() ? x.format('M月D日') : x.format('YYYY年M月D日')
  return `${head} ${weekday(d)}`
}

/** 90 → 1小时30分；45 → 45分钟；120 → 2小时 */
export function fmtDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes))
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h === 0) {
    return `${m}分钟`
  }
  return m === 0 ? `${h}小时` : `${h}小时${m}分`
}

/** 已流逝时长，用于"距上次喂奶 2小时15分" */
export function elapsed(from: number, now: number = Date.now()): string {
  return fmtDuration((now - from) / 60000)
}

/** 相对时间：刚刚 / 5分钟前 / 3小时前 / 昨天 14:20 / 9月26日 */
export function ago(t: number, now: number = Date.now()): string {
  const min = Math.floor((now - t) / 60000)
  if (min < 1) {
    return '刚刚'
  }
  if (min < 60) {
    return `${min}分钟前`
  }
  if (dateKey(t) === dateKey(now) && min < 24 * 60) {
    return `${Math.floor(min / 60)}小时前`
  }
  if (dateKey(t) === shiftDate(dateKey(now), -1)) {
    return `昨天 ${hm(t)}`
  }
  return dayjs(t).format('M月D日 HH:mm')
}

/* ── 月龄 ───────────────────────────────────────────────────────────────── */

export interface Age {
  months: number
  days: number
  /** 出生至今的天数（出生当天为 0） */
  totalDays: number
  /** 精确到小数的月龄，用于匹配月龄方案 */
  monthsFloat: number
}

export function ageOf(birthday: DateKey, at: TimeLike = Date.now()): Age {
  const b = dayjs(birthday).startOf('day')
  const d = dayjs(at).startOf('day')
  if (d.isBefore(b)) {
    return { months: 0, days: 0, totalDays: 0, monthsFloat: 0 }
  }
  let months = (d.year() - b.year()) * 12 + (d.month() - b.month())
  if (b.add(months, 'month').isAfter(d)) {
    months--
  }
  const anchor = b.add(months, 'month')
  const days = d.diff(anchor, 'day')
  const span = b.add(months + 1, 'month').diff(anchor, 'day')
  return { months, days, totalDays: d.diff(b, 'day'), monthsFloat: months + days / span }
}

/** 12天 / 5个月12天 / 2岁3个月 */
export function ageText(age: Age): string {
  const { months, days } = age
  if (months === 0) {
    return `${days}天`
  }
  if (months < 24) {
    return days ? `${months}个月${days}天` : `${months}个月`
  }
  const rest = months % 12
  return `${Math.floor(months / 12)}岁${rest ? `${rest}个月` : ''}`
}

/* ── 统计区间 ───────────────────────────────────────────────────────────── */

export type RangeMode = 'day' | 'week' | 'month'

export interface DateRange {
  start: DateKey
  end: DateKey
  days: DateKey[]
}

/** 周按周一至周日计算，月按自然月计算 */
export function rangeOf(mode: RangeMode, anchor: DateKey): DateRange {
  const a = dayjs(anchor)
  const start = mode === 'day' ? a : mode === 'week' ? a.subtract((a.day() + 6) % 7, 'day') : a.startOf('month')
  const end = mode === 'day' ? a : mode === 'week' ? start.add(6, 'day') : a.endOf('month')
  const days: DateKey[] = []
  for (let x = start; !x.isAfter(end, 'day'); x = x.add(1, 'day')) {
    days.push(x.format(DATE_FMT))
  }
  return { start: start.format(DATE_FMT), end: end.format(DATE_FMT), days }
}

export function rangeLabel(mode: RangeMode, r: DateRange): string {
  if (mode === 'day') {
    return dateLabel(r.start)
  }
  if (mode === 'month') {
    return dayjs(r.start).format('YYYY年M月')
  }
  return `${dayjs(r.start).format('M.D')} - ${dayjs(r.end).format('M.D')}`
}
