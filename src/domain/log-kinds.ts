/* ============================================================================
 *  日志类型的业务语义
 * ----------------------------------------------------------------------------
 *  摘要文本 / 异常判定 / 默认值 —— 时间线、消息推送、每日汇报共用，
 *  保证同一条记录在任何地方都被"说成同一句话"。
 * ========================================================================== */

import {
  ACCEPT_LABEL, BREAST_SIDE_LABEL, DIAPER_KIND_LABEL, FEVER_LINE, MILK_MODE_LABEL,
  SLEEP_QUALITY_LABEL, STOOL_COLORS, STOOL_TEXTURES, STOOL_VOLUME_LABEL, TEMP_METHOD_LABEL,
} from '@/shared/constants'
import type { CareLog, LogDataMap, LogType } from '@/shared/types'
import { fmtDuration, hm } from '@/utils/time'

type LogOf<T extends LogType> = CareLog<T>

const labelOf = (list: { value: string; label: string }[], v: string | null) =>
  list.find((x) => x.value === v)?.label ?? ''

/* ── 默认值：新建记录时的"聪明默认" ─────────────────────────────────────── */

export function emptyData<T extends LogType>(type: T): LogDataMap[T] {
  const defaults: LogDataMap = {
    milk: { mode: 'formula', amount: 120, duration: null, side: null },
    solid: { foods: [], amount: '少量', accept: 'normal', reaction: '' },
    diaper: { kind: 'pee', color: null, texture: null, volume: null },
    sleep: { quality: null },
    temp: { value: 36.8, method: 'ear' },
    medicine: { name: '维生素D', dose: '1粒' },
    growth: { weight: null, height: null, head: null },
    other: { title: '' },
  }
  return defaults[type]
}

/* ── 睡眠时长 ───────────────────────────────────────────────────────────── */

/** 进行中的睡眠按 now 计算 */
export function sleepMinutes(log: CareLog, now: number = Date.now()): number {
  return Math.max(0, ((log.endTime ?? now) - log.time) / 60000)
}

export const isSleeping = (log: CareLog) => log.type === 'sleep' && log.endTime === null

/* ── 异常判定 ───────────────────────────────────────────────────────────── */

export function isFever(log: LogOf<'temp'>): boolean {
  return log.data.value >= FEVER_LINE[log.data.method]
}

export function abnormalReason(log: CareLog): string | null {
  switch (log.type) {
    case 'temp': {
      const t = log as LogOf<'temp'>
      return isFever(t) ? `体温偏高 ${t.data.value}℃` : null
    }
    case 'diaper': {
      const d = (log as LogOf<'diaper'>).data
      const color = STOOL_COLORS.find((c) => c.value === d.color)
      const texture = STOOL_TEXTURES.find((c) => c.value === d.texture)
      const bad = [color?.abnormal ? color.label : '', texture?.abnormal ? texture.label : ''].filter(Boolean)
      return bad.length ? `大便${bad.join('、')}` : null
    }
    case 'solid': {
      const s = (log as LogOf<'solid'>).data
      return s.reaction ? `辅食后${s.reaction}` : null
    }
    default:
      return null
  }
}

/* ── 摘要 ───────────────────────────────────────────────────────────────── */

export function summarizeLog(log: CareLog, now: number = Date.now()): string {
  switch (log.type) {
    case 'milk': {
      const d = (log as LogOf<'milk'>).data
      if (d.mode === 'breast') {
        return [MILK_MODE_LABEL.breast, d.side ? BREAST_SIDE_LABEL[d.side] : '', d.duration ? `${d.duration}分钟` : '']
          .filter(Boolean)
          .join(' ')
      }
      return `${MILK_MODE_LABEL[d.mode]} ${d.amount ?? 0}ml`
    }
    case 'solid': {
      const d = (log as LogOf<'solid'>).data
      const foods = d.foods.length ? d.foods.join('、') : '辅食'
      return [foods, d.amount, ACCEPT_LABEL[d.accept], d.reaction].filter(Boolean).join(' · ')
    }
    case 'diaper': {
      const d = (log as LogOf<'diaper'>).data
      if (d.kind === 'pee') {
        return '小便'
      }
      const traits = [labelOf(STOOL_COLORS, d.color), labelOf(STOOL_TEXTURES, d.texture)].filter(Boolean).join(' ')
      return [DIAPER_KIND_LABEL[d.kind], traits, d.volume ? STOOL_VOLUME_LABEL[d.volume] : ''].filter(Boolean).join(' · ')
    }
    case 'sleep': {
      const d = (log as LogOf<'sleep'>).data
      if (log.endTime === null) {
        return `正在睡 · ${hm(log.time)} 入睡 · 已睡${fmtDuration(sleepMinutes(log, now))}`
      }
      return [`${hm(log.time)}-${hm(log.endTime)}`, fmtDuration(sleepMinutes(log)), d.quality ? SLEEP_QUALITY_LABEL[d.quality] : '']
        .filter(Boolean)
        .join(' · ')
    }
    case 'temp': {
      const t = log as LogOf<'temp'>
      return `${t.data.value.toFixed(1)}℃ ${TEMP_METHOD_LABEL[t.data.method]}${isFever(t) ? ' · 偏高' : ''}`
    }
    case 'medicine': {
      const d = (log as LogOf<'medicine'>).data
      return [d.name, d.dose].filter(Boolean).join(' ')
    }
    case 'growth': {
      const d = (log as LogOf<'growth'>).data
      return [
        d.weight ? `体重 ${d.weight}kg` : '',
        d.height ? `身高 ${d.height}cm` : '',
        d.head ? `头围 ${d.head}cm` : '',
      ].filter(Boolean).join(' · ') || '成长记录'
    }
    case 'other':
      return (log as LogOf<'other'>).data.title || log.note || '其他记录'
  }
}
