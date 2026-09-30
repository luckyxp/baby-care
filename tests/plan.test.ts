/* ============================================================================
 *  周期模板计划测试
 * ----------------------------------------------------------------------------
 *  默认计划为空；内置与自定义模板均以完整周为应用单位。
 * ========================================================================== */

import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Actor, Baby, PlanTemplate, TemplateTask } from '@/shared/types'
import { closeClientDB, db, openClientDB } from '@/db/client'
import { bindRepo, create } from '@/db/repo'
import { applyTemplate, ensurePlan, saveWeeklyTemplate } from '@/services/plan'
import { dateKey, dayjs } from '@/utils/time'
import { uid } from '@/utils/id'

const auth = vi.hoisted(() => ({ isAdmin: true }))
vi.mock('@/stores/session', () => ({ useSession: () => auth }))

const date = dateKey()
const envelope = { familyId: 'family', createdBy: 'nanny', updatedBy: 'nanny', createdAt: 1, updatedAt: 1, deleted: 0 as const, seq: 0 }
const baby: Baby = {
  ...envelope, id: 'baby', name: '小米粒', gender: 'girl', birthday: dayjs(date).subtract(7, 'month').format('YYYY-MM-DD'),
  feedingMode: 'mixed', birthWeight: null, birthHeight: null, allergies: '', avatar: '', schedule: null,
}
let actor: Actor

beforeEach(() => {
  openClientDB(`plan-template-${uid()}`)
  actor = { userId: 'nanny', familyId: 'family', role: 'admin', relation: 'nanny' }
  bindRepo({ actor: () => actor, onWrite: () => {} })
})

afterEach(async () => {
  bindRepo(null)
  await closeClientDB(true)
})

const monday = dayjs(date).subtract((dayjs(date).day() + 6) % 7, 'day').format('YYYY-MM-DD')
const atWeekday = (weekday: number) => dayjs(monday).add(weekday === 0 ? 6 : weekday - 1, 'day').format('YYYY-MM-DD')
const task = (weekday: number, title: string): TemplateTask => ({
  weekday, kind: 'feeding', category: 'solid', slot: 'day', time: '12:00', title, desc: '', steps: [], sourceId: null, amount: null, order: 1,
})

describe('周期模板', () => {
  it('打开日期仅创建空计划，不自动创建任务', async () => {
    await ensurePlan(baby, date)
    expect(await db().plans.count()).toBe(1)
    expect(await db().tasks.count()).toBe(0)
  })

  it('内置模板会覆盖当前所在周的七天安排', async () => {
    await applyTemplate(baby, date)
    expect(await db().plans.count()).toBe(7)
    const tasks = await db().tasks.toArray()
    expect(new Set(tasks.map((item) => item.date)).size).toBe(7)
    expect(tasks.length).toBeGreaterThan(20)
  })

  it('自定义模板一次保存七天配置，并按对应星期应用', async () => {
    const entries = [task(1, '周一南瓜泥'), task(2, '周二胡萝卜泥'), task(0, '周日苹果泥')]
    await saveWeeklyTemplate(baby, '一周辅食', entries)
    const template = (await db().templates.toArray())[0] as PlanTemplate
    expect(template.tasks).toHaveLength(3)

    await applyTemplate(baby, date, template)
    expect((await db().tasks.where('[babyId+date]').equals([baby.id, atWeekday(1)]).toArray()).map((item) => item.title)).toEqual(['周一南瓜泥'])
    expect((await db().tasks.where('[babyId+date]').equals([baby.id, atWeekday(2)]).toArray()).map((item) => item.title)).toEqual(['周二胡萝卜泥'])
    expect((await db().tasks.where('[babyId+date]').equals([baby.id, atWeekday(0)]).toArray()).map((item) => item.title)).toEqual(['周日苹果泥'])
  })

  it('应用周期模板会覆盖本周已存在安排', async () => {
    const target = atWeekday(1)
    await create('tasks', { babyId: baby.id, date: target, kind: 'feeding', category: 'milk', slot: 'day', assignee: 'nanny', time: '08:00', title: '旧安排', desc: '', steps: [], sourceId: null, amount: 180, order: 1 })
    await saveWeeklyTemplate(baby, '新安排', [task(1, '新安排')])
    await applyTemplate(baby, date, (await db().templates.toArray())[0])
    expect((await db().tasks.where('[babyId+date]').equals([baby.id, target]).toArray()).map((item) => item.title)).toEqual(['新安排'])
  })
})
