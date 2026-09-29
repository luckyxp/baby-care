/* ============================================================================
 *  每日汇报生成器 · Report
 * ----------------------------------------------------------------------------
 *  从当天的日志 / 计划 / 打卡 / 留言中抓取数据，生成分块的交接汇报：
 *
 *    🍼 喂养  😴 睡眠  💩 排便  🌡️ 健康  🎯 早教  💞 亲子  💬 留言  📝 小结  📌 交接
 *
 *  每块都可被育儿嫂改写（edited=true）；"刷新数据"只更新未改写的块，
 *  改写过的内容永远不会被系统覆盖。
 * ========================================================================== */

import {
  ACCEPT_LABEL, EDU_CATEGORIES, EDU_KEYS, MILK_MODE_LABEL, RATING_LABEL, STOOL_COLORS, STOOL_TEXTURES,
  memberLabel,
} from '@/shared/constants'
import type {
  Baby, CareLog, Checkin, DateKey, EduCategory, Member, Note, PlanTask, ReportBlock,
} from '@/shared/types'
import { abnormalReason, isSleeping, sleepMinutes, summarizeLog } from './log-kinds'
import { matchFeeding } from './planner'
import { summarizeDay } from './stats'
import { ageOf, ageText, dayjs, fmtDuration, hm, shiftDate, weekday } from '@/utils/time'

export interface ReportInput {
  baby: Baby
  date: DateKey
  /** 需覆盖 date 的前一天（跨夜睡眠与环比） */
  logs: CareLog[]
  tasks: PlanTask[]
  checkins: Checkin[]
  dayNotes: Note[]
  members: Member[]
  now?: number
}

export const BLOCK_META: { key: string; title: string; icon: string; placeholder: string }[] = [
  { key: 'feeding', title: '喂养', icon: '🍼', placeholder: '今日暂无喂养记录' },
  { key: 'sleep', title: '睡眠', icon: '😴', placeholder: '今日暂无睡眠记录' },
  { key: 'diaper', title: '排便', icon: '💩', placeholder: '今日暂无排便记录' },
  { key: 'health', title: '体温与用药', icon: '🌡️', placeholder: '' },
  { key: 'edu', title: '早教', icon: '🎯', placeholder: '' },
  { key: 'interaction', title: '亲子互动', icon: '💞', placeholder: '' },
  { key: 'notes', title: '家人留言', icon: '💬', placeholder: '' },
  { key: 'summary', title: '今日小结', icon: '📝', placeholder: '' },
  { key: 'handover', title: '交接提醒', icon: '📌', placeholder: '' },
]

const range = (xs: number[]) => {
  const lo = Math.min(...xs)
  const hi = Math.max(...xs)
  return lo === hi ? `${lo}ml` : `${lo}-${hi}ml`
}

const byTime = (a: CareLog, b: CareLog) => a.time - b.time

const labelOf = (list: { value: string; label: string }[], v: string | null) => list.find((x) => x.value === v)?.label ?? ''

/* ── 分块生成 ───────────────────────────────────────────────────────────── */

function feedingText(logs: CareLog[], tasks: PlanTask[]): string {
  const lines: string[] = []
  const milk = logs.filter((l): l is CareLog<'milk'> => l.type === 'milk').sort(byTime)
  const parts = (['formula', 'bottle_breast'] as const)
    .map((mode) => milk.filter((l) => l.data.mode === mode))
    .filter((xs) => xs.length)
    .map((xs) => {
      const amounts = xs.map((l) => l.data.amount ?? 0)
      const total = amounts.reduce((s, x) => s + x, 0)
      return `${MILK_MODE_LABEL[xs[0].data.mode]} ${xs.length} 次共 ${total}ml（单次 ${range(amounts)}）`
    })
  const breast = milk.filter((l) => l.data.mode === 'breast')
  if (breast.length) {
    parts.push(`母乳亲喂 ${breast.length} 次共约 ${breast.reduce((s, l) => s + (l.data.duration ?? 0), 0)} 分钟`)
  }
  if (parts.length) {
    lines.push(`奶：${parts.join('；')}`)
  }

  const milkTasks = tasks.filter((t) => t.kind === 'feeding' && t.category === 'milk')
  if (milkTasks.length) {
    const matched = matchFeeding(tasks, logs)
    const done = milkTasks.filter((t) => matched.has(t.id)).length
    lines.push(`计划喂奶 ${milkTasks.length} 次，已完成 ${done} 次`)
  }

  const solids = logs.filter((l): l is CareLog<'solid'> => l.type === 'solid').sort(byTime)
  if (solids.length) {
    const items = solids.map((l) => {
      const foods = l.data.foods.length ? l.data.foods.join('+') : '辅食'
      return `${foods}（${[l.data.amount, ACCEPT_LABEL[l.data.accept], l.data.reaction].filter(Boolean).join('，')}）`
    })
    lines.push(`辅食 ${solids.length} 次：${items.join('、')}`)
  }
  return lines.join('\n')
}

function sleepText(date: DateKey, logs: CareLog[], now: number): string {
  const s = summarizeDay(date, logs, now)
  if (!s.sleepMin) {
    return ''
  }
  const lines = [`全天约 ${fmtDuration(s.sleepMin)}，最长一觉 ${fmtDuration(s.longestSleepMin)}`]
  if (s.napCount) {
    lines.push(`白天小睡 ${s.napCount} 次，共 ${fmtDuration(s.napMin)}`)
  }
  const ongoing = logs.find(isSleeping)
  if (ongoing && ongoing.date === date) {
    lines.push(`${hm(ongoing.time)} 入睡，目前还在睡`)
  }
  return lines.join('\n')
}

function diaperText(logs: CareLog[]): string {
  const diapers = logs.filter((l): l is CareLog<'diaper'> => l.type === 'diaper').sort(byTime)
  if (!diapers.length) {
    return ''
  }
  const pee = diapers.filter((l) => l.data.kind !== 'poop').length
  const poops = diapers.filter((l) => l.data.kind !== 'pee')
  const lines = [`小便 ${pee} 次，大便 ${poops.length} 次`]
  if (poops.length) {
    const traits = poops.map((l) => {
      const t = [labelOf(STOOL_COLORS, l.data.color), labelOf(STOOL_TEXTURES, l.data.texture)].filter(Boolean).join('')
      return `${hm(l.time)}${t ? ` ${t}` : ''}`
    })
    lines.push(`大便：${traits.join('、')}`)
  }
  return lines.join('\n')
}

function healthText(logs: CareLog[]): string {
  const lines: string[] = []
  const temps = logs.filter((l): l is CareLog<'temp'> => l.type === 'temp').sort(byTime)
  if (temps.length) {
    const max = temps.reduce((a, b) => (b.data.value > a.data.value ? b : a))
    const fever = temps.filter((l) => abnormalReason(l))
    lines.push(`体温测量 ${temps.length} 次，最高 ${max.data.value.toFixed(1)}℃${fever.length ? '，有偏高请留意' : '，未达到本应用的高温提醒阈值'}`)
  } else {
    lines.push('今日未记录体温，无法判断体温情况')
  }
  const meds = logs.filter((l) => l.type === 'medicine').sort(byTime)
  if (meds.length) {
    lines.push(`用药/补剂：${meds.map((l) => `${summarizeLog(l)}（${hm(l.time)}）`).join('、')}`)
  }
  const growth = logs.filter((l) => l.type === 'growth').sort(byTime).pop()
  if (growth) {
    lines.push(`成长测量：${summarizeLog(growth)}`)
  }
  return lines.join('\n')
}

function checkinPhrase(ck: Checkin | undefined): string {
  if (!ck) {
    return '未完成'
  }
  return [RATING_LABEL[ck.rating], ck.tags.join('、'), ck.note].filter(Boolean).join('，')
}

function eduText(tasks: PlanTask[], checkins: Map<string, Checkin>): string {
  const edu = tasks
    .filter((t) => t.kind === 'edu')
    .sort((a, b) => EDU_KEYS.indexOf(a.category as EduCategory) - EDU_KEYS.indexOf(b.category as EduCategory))
  if (!edu.length) {
    return ''
  }
  const done = edu.filter((t) => checkins.has(t.id)).length
  const lines = edu.map((t) => {
    const cat = EDU_CATEGORIES[t.category as EduCategory]?.label ?? '早教'
    return `· ${cat}｜${t.title}：${checkinPhrase(checkins.get(t.id))}`
  })
  return [`完成 ${done}/${edu.length} 项`, ...lines].join('\n')
}

function interactionText(tasks: PlanTask[], checkins: Map<string, Checkin>): string {
  const lines: string[] = []
  const day = tasks.filter((t) => t.kind === 'interaction' && t.slot === 'day')
  if (day.length) {
    lines.push(`日间：${day.map((t) => `${t.title}（${checkinPhrase(checkins.get(t.id))}）`).join('、')}`)
  }
  const evening = tasks.filter((t) => t.kind === 'interaction' && t.slot === 'evening')
  if (evening.length) {
    const items = evening.map((t) => (checkins.has(t.id) ? `${t.title}（${checkinPhrase(checkins.get(t.id))}）` : `${t.title}（待完成）`))
    lines.push(`晚间留给爸爸妈妈：${items.join('、')}`)
  }
  return lines.join('\n')
}

function notesText(notes: Note[], members: Member[]): string {
  return [...notes]
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((n) => {
      const m = members.find((x) => x.userId === n.createdBy)
      return `${m ? memberLabel(m) : '家人'}：${n.content}`
    })
    .join('\n')
}

function summaryText(date: DateKey, logs: CareLog[], edu: PlanTask[], checkins: Map<string, Checkin>, now: number): string {
  const today = summarizeDay(date, logs, now)
  const prev = summarizeDay(shiftDate(date, -1), logs, now)
  const parts: string[] = []
  if (today.milkMl && prev.milkMl && Math.abs(today.milkMl - prev.milkMl) >= 30) {
    const d = today.milkMl - prev.milkMl
    parts.push(`奶量较昨天${d > 0 ? '多' : '少'} ${Math.abs(d)}ml`)
  }
  if (today.sleepMin && prev.sleepMin && Math.abs(today.sleepMin - prev.sleepMin) >= 60) {
    const d = today.sleepMin - prev.sleepMin
    parts.push(`睡眠较昨天${d > 0 ? '多' : '少'} ${fmtDuration(Math.abs(d))}`)
  }
  const eduTasks = edu.filter((t) => t.kind === 'edu')
  if (eduTasks.length && eduTasks.every((t) => checkins.has(t.id))) {
    parts.push('早教任务全部完成')
  }
  const alerts = logs
    .filter((l) => l.date === date)
    .sort(byTime)
    .map((l) => [l, abnormalReason(l)] as const)
    .filter(([, r]) => r)
    .map(([l, r]) => `⚠️ ${hm(l.time)} ${r}`)
  const recorded = logs.filter((l) => l.date === date).length
  const head = parts.length ? `${parts.join('，')}。` : recorded ? `今日已录入 ${recorded} 条护理记录；汇总仅反映已录入内容。` : '今日尚无护理记录，无法据此判断宝宝状态。'
  return [head, ...alerts].join('\n')
}

function handoverText(date: DateKey, logs: CareLog[], tasks: PlanTask[], checkins: Map<string, Checkin>, now: number): string {
  const today = logs.filter((l) => l.date === date).sort(byTime)
  const lines: string[] = []
  const lastMilk = today.filter((l) => l.type === 'milk').pop()
  if (lastMilk) {
    lines.push(`最近一次喂奶：${hm(lastMilk.time)}，${summarizeLog(lastMilk)}`)
  }
  const lastPoop = today.filter((l) => l.type === 'diaper' && (l as CareLog<'diaper'>).data.kind !== 'pee').pop()
  if (lastPoop) {
    lines.push(`最近一次大便：${hm(lastPoop.time)}`)
  }
  const sleeping = logs.find(isSleeping)
  if (sleeping) {
    lines.push(`宝宝 ${hm(sleeping.time)} 入睡，已睡 ${fmtDuration(sleepMinutes(sleeping, now))}`)
  }
  const pending = tasks.filter((t) => t.slot === 'evening' && t.kind === 'interaction' && !checkins.has(t.id))
  if (pending.length) {
    lines.push(`今晚请爸爸妈妈完成：${pending.map((t) => t.title).join('、')}`)
  }
  return lines.join('\n')
}

/* ── 对外接口 ─────────────────────────────────────────────────────────────── */

export function buildReport(input: ReportInput): ReportBlock[] {
  const { date, tasks, dayNotes, members } = input
  const now = input.now ?? Date.now()
  const today = input.logs.filter((l) => l.date === date)
  const ck = new Map(input.checkins.map((c) => [c.taskId, c]))

  const text: Record<string, string> = {
    feeding: feedingText(today, tasks),
    sleep: sleepText(date, input.logs, now),
    diaper: diaperText(today),
    health: healthText(today),
    edu: eduText(tasks, ck),
    interaction: interactionText(tasks, ck),
    notes: notesText(dayNotes, members),
    summary: summaryText(date, input.logs, tasks, ck, now),
    handover: handoverText(date, input.logs, tasks, ck, now),
  }
  return BLOCK_META.map(({ key, title, icon, placeholder }) => ({
    key, title, icon, text: text[key] || placeholder, edited: false,
  }))
}

/** 刷新数据：未改写的块取新值，改写过的块原样保留 */
export function mergeBlocks(saved: ReportBlock[], fresh: ReportBlock[]): ReportBlock[] {
  const kept = new Map(saved.filter((b) => b.edited).map((b) => [b.key, b]))
  const merged = fresh.map((b) => kept.get(b.key) ?? b)
  const extra = [...kept.values()].filter((b) => !fresh.some((f) => f.key === b.key))
  return [...merged, ...extra]
}

/** 一键复制的纯文本（适配微信排版） */
export function renderReport(baby: Baby, date: DateKey, blocks: ReportBlock[], author?: string): string {
  const head = `【${baby.name} · ${dayjs(date).format('M月D日')} ${weekday(date)} 护理日报】`
  const meta = `${ageText(ageOf(baby.birthday, date))}${author ? ` · 记录人：${author}` : ''}`
  const body = blocks
    .filter((b) => b.text.trim())
    .map((b) => `${b.icon} ${b.title}\n${b.text.trim()}`)
    .join('\n\n')
  return `${head}\n${meta}\n\n${body}`
}
