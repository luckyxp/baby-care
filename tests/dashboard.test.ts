/* ============================================================================
 *  数据看板区间聚合测试
 * ========================================================================== */

import { describe, expect, it } from 'vitest'
import { rankCategories, summarizeRange } from '@/domain/dashboard'
import type { CareLog, Checkin, LogDataMap, LogType, PlanTask } from '@/shared/types'
import { atTime, rangeOf } from '@/utils/time'

let n = 0

function log<T extends LogType>(type: T, date: string, time: string, data: LogDataMap[T], endTime: number | null = null): CareLog {
  const t = atTime(date, time)
  return {
    id: `l${n++}`, familyId: 'f', createdBy: 'u', createdAt: t, updatedBy: 'u', updatedAt: t, deleted: 0, seq: 1,
    babyId: 'b', type, date, time: t, endTime, data, note: '', source: 'manual', taskId: null,
  }
}

const milk = (date: string, time: string, amount: number) => log('milk', date, time, { mode: 'formula', amount, duration: null, side: null })
const solid = (date: string, time: string, foods: string[]) => log('solid', date, time, { foods, amount: '少量', accept: 'like', reaction: '' })

function task(id: string, date: string, kind: PlanTask['kind'], category: PlanTask['category'], slot: PlanTask['slot'] = 'day'): PlanTask {
  return {
    id, familyId: 'f', createdBy: 'u', createdAt: 0, updatedBy: 'u', updatedAt: 0, deleted: 0, seq: 1,
    babyId: 'b', date, kind, category, slot, assignee: slot === 'evening' ? 'parent' : 'nanny', time: null,
    title: id, desc: '', steps: [], sourceId: null, amount: null, order: 0,
  }
}

function checkin(t: PlanTask): Checkin {
  return {
    id: `c-${t.id}`, familyId: 'f', createdBy: 'u', createdAt: 0, updatedBy: 'u', updatedAt: 0, deleted: 0, seq: 1,
    babyId: 'b', date: t.date, taskId: t.id, kind: t.kind, category: t.category, slot: t.slot, rating: 4, tags: [], note: '', duration: null,
  }
}

describe('summarizeRange', () => {
  // 2026-09-28 是周一，这一周为 9.28 - 10.4
  const week = rangeOf('week', '2026-09-30')

  it('周区间：未来日期不计入，日均按有记录天数计算', () => {
    const logs = [
      milk('2026-09-28', '07:00', 150),
      milk('2026-09-28', '11:00', 150),
      milk('2026-09-29', '07:00', 200),
      log('temp', '2026-09-29', '09:00', { value: 38.2, method: 'ear' }),
      log('diaper', '2026-09-29', '10:00', { kind: 'poop', color: 'green', texture: 'watery', volume: 'medium' }),
      log('diaper', '2026-09-29', '12:00', { kind: 'pee', color: null, texture: null, volume: null }),
    ]
    const s = summarizeRange({ days: week.days, logs, tasks: [], checkins: [], today: '2026-09-30', now: atTime('2026-09-30', '12:00') })
    expect(week.start).toBe('2026-09-28')
    expect(s.days).toEqual(['2026-09-28', '2026-09-29', '2026-09-30'])
    expect(s.activeDays).toBe(2)
    expect(s.totals.milkMl).toBe(500)
    expect(s.averages.milkMl).toBe(250)
    expect(s.totals.feverCount).toBe(1)
    expect(s.totals.tempMax).toBe(38.2)
    expect(s.totals.abnormalPoop).toBe(1)
    expect(s.totals).toMatchObject({ pee: 1, poop: 1 })
  })

  it('跨夜睡眠按天拆分，睡眠日均只统计有睡眠的天', () => {
    const sleep = log('sleep', '2026-09-27', '21:00', { quality: 'good' }, atTime('2026-09-28', '06:00'))
    const s = summarizeRange({ days: week.days, logs: [sleep], tasks: [], checkins: [], today: '2026-09-29', now: atTime('2026-09-29', '12:00') })
    expect(s.perDay[0].sleepMin).toBe(360)
    expect(s.totals.sleepMin).toBe(360)
    expect(s.averages.sleepMin).toBe(360)
    expect(s.longestSleepMin).toBe(540)
  })

  it('新尝试食材排除区间之前吃过的', () => {
    const logs = [solid('2026-09-28', '11:00', ['南瓜', '高铁米粉']), solid('2026-09-29', '11:00', ['南瓜', '胡萝卜'])]
    const s = summarizeRange({ days: week.days, logs, tasks: [], checkins: [], today: '2026-09-29', priorFoods: ['高铁米粉'] })
    expect(s.foods).toEqual(['南瓜', '高铁米粉', '胡萝卜'])
    expect(s.newFoods).toEqual(['南瓜', '胡萝卜'])
    expect(s.totals.solidCount).toBe(2)
  })

  it('五大领域频次与日间/晚间亲子完成率，区间外数据忽略', () => {
    const tasks = [
      task('t1', '2026-09-28', 'edu', 'gross'),
      task('t2', '2026-09-28', 'edu', 'gross'),
      task('t3', '2026-09-28', 'edu', 'language'),
      task('t4', '2026-09-28', 'interaction', 'social', 'evening'),
      task('t5', '2026-09-28', 'interaction', 'sensory', 'day'),
      task('t6', '2026-09-20', 'edu', 'fine'),
    ]
    const done = [checkin(tasks[0]), checkin(tasks[1]), checkin(tasks[3]), checkin(tasks[5])]
    const s = summarizeRange({ days: week.days, logs: [], tasks, checkins: done, today: '2026-09-29' })
    expect(s.edu.byCategory.gross).toEqual({ done: 2, planned: 2 })
    expect(s.edu.byCategory.fine).toEqual({ done: 0, planned: 0 })
    expect(s.edu.byCategory.social).toEqual({ done: 1, planned: 1 })
    expect(s.edu.edu).toEqual({ done: 2, planned: 3 })
    expect(s.edu.evening).toEqual({ done: 1, planned: 1 })
    expect(s.edu.day).toEqual({ done: 0, planned: 1 })

    const rank = rankCategories(s.edu)
    expect(rank.most).toEqual(['gross'])
    expect(rank.least).toEqual(['fine', 'sensory', 'language'])
  })

  it('无打卡时排行为空', () => {
    const s = summarizeRange({ days: ['2026-09-28'], logs: [], tasks: [], checkins: [], today: '2026-09-28' })
    expect(rankCategories(s.edu)).toEqual({ most: [], least: [] })
    expect(s.activeDays).toBe(0)
    expect(s.averages.milkMl).toBe(0)
  })
})
