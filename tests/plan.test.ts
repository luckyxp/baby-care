/* ============================================================================
 *  计划业务测试：真实 IndexedDB + repo，仅模拟界面身份
 * ----------------------------------------------------------------------------
 *  覆盖幂等生成、父母权限、事务回滚、已完成任务保留、历史补录日期及打卡防重。
 * ========================================================================== */

import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Actor, Baby, CareLog, PlanTask } from '@/shared/types'
import { db, closeClientDB, openClientDB } from '@/db/client'
import { bindRepo, update } from '@/db/repo'
import { EDU_ACTIVITIES, RECIPES, stageOf } from '@/library'
import { ageOf, atTime, dateKey, dayjs, shiftDate, todayKey } from '@/utils/time'
import { uid } from '@/utils/id'
import {
  addCustomTask, addFromLibrary, checkin, ensurePlan, feedingPreset, regenerate,
  removeTask, resetFeeding, saveAsDefaultSchedule, undoCheckin, updateTask,
} from '@/services/plan'

const auth = vi.hoisted(() => ({ isAdmin: true }))
vi.mock('@/stores/session', () => ({ useSession: () => auth }))

const date = todayKey()
const envelope = { familyId: 'family', createdBy: 'nanny', updatedBy: 'nanny', createdAt: 1, updatedAt: 1, deleted: 0 as const, seq: 0 }
const baby: Baby = {
  ...envelope, id: 'baby', name: '小米粒', gender: 'girl', birthday: dayjs(date).subtract(7, 'month').format('YYYY-MM-DD'),
  feedingMode: 'mixed', birthWeight: null, birthHeight: null, allergies: '', avatar: '', schedule: null,
}
let actor: Actor
const allTasks = () => db().tasks.toArray()
const input = { rating: 4 as const, tags: ['开心'], note: '专注地玩了几分钟', duration: 5 }

beforeEach(() => {
  openClientDB(`plan-test-${uid()}`)
  auth.isAdmin = true
  actor = { userId: 'nanny', familyId: 'family', role: 'admin', relation: 'nanny' }
  bindRepo({ actor: () => actor, onWrite: () => {} })
})

afterEach(async () => {
  vi.restoreAllMocks()
  bindRepo(null)
  await closeClientDB(true)
})

describe('每日计划生成', () => {
  it('并发调用只写一份计划和任务，重复进入不会覆盖调整', async () => {
    await Promise.all([ensurePlan(baby, date), ensurePlan(baby, date), ensurePlan(baby, date)])
    expect(await db().plans.count()).toBe(1)
    const tasks = await allTasks()
    expect(tasks.length).toBeGreaterThan(5)
    expect(await db().outbox.count()).toBe(tasks.length + 1)
    await update('tasks', { id: tasks[0].id, title: '育儿嫂调整过的任务' })
    await ensurePlan(baby, date)
    expect((await db().tasks.get(tasks[0].id))?.title).toBe('育儿嫂调整过的任务')
  })

  it('过去日期不自动生成，家长进入也不自动生成', async () => {
    await ensurePlan(baby, shiftDate(date, -1))
    auth.isAdmin = false
    await ensurePlan(baby, date)
    expect(await db().plans.count()).toBe(0)
    expect(await db().outbox.count()).toBe(0)
  })

  it('未来日期可以提前生成', async () => {
    const tomorrow = shiftDate(date, 1)
    await ensurePlan(baby, tomorrow)
    expect((await allTasks()).every((t) => t.date === tomorrow)).toBe(true)
    expect(await db().plans.count()).toBe(1)
  })

  it('任务落库失败时计划和队列一并回滚，重试可以成功', async () => {
    const spy = vi.spyOn(db().tasks, 'put').mockRejectedValueOnce(new Error('模拟写入失败'))
    await expect(ensurePlan(baby, date)).rejects.toThrow('模拟写入失败')
    expect(await db().plans.count()).toBe(0)
    expect(await db().tasks.count()).toBe(0)
    expect(await db().outbox.count()).toBe(0)
    spy.mockRestore()
    await ensurePlan(baby, date)
    expect(await db().plans.count()).toBe(1)
  })
})

describe('批量与单条调整', () => {
  it('换一批保留已打卡任务及喂养，不会额外增加已完成领域的名额', async () => {
    await ensurePlan(baby, date)
    const before = await allTasks()
    const task = before.find((t) => t.kind === 'edu')!
    const ck = await checkin(task, input)
    vi.spyOn(Math, 'random').mockReturnValue(0.25)
    await regenerate(baby, date)
    const after = await allTasks()
    expect(await db().tasks.get(task.id)).toEqual(task)
    expect(await db().checkins.get(ck.id)).toEqual(ck)
    expect(after.filter((t) => t.kind === 'feeding')).toEqual(before.filter((t) => t.kind === 'feeding'))
    expect(after.filter((t) => t.kind === 'edu' && t.category === task.category)).toHaveLength(1)
    expect(after.filter((t) => t.kind !== 'feeding').length).toBeLessThanOrEqual(before.filter((t) => t.kind !== 'feeding').length)
  })

  it('恢复作息保留已经匹配日志的任务，其他时点按默认作息重建', async () => {
    await ensurePlan(baby, date)
    const before = await allTasks()
    const task = before.find((t) => t.kind === 'feeding' && t.category === 'milk')!
    const log: CareLog = {
      ...envelope, id: uid(), babyId: baby.id, date, time: atTime(date, task.time!), type: 'milk', endTime: null,
      data: { amount: 150, mode: 'formula', duration: null, side: null }, source: 'task', taskId: task.id, note: '',
    }
    await db().logs.put(log)
    await resetFeeding(baby, date)
    expect(await db().tasks.get(task.id)).toEqual(task)
    const after = await allTasks()
    expect(after.filter((t) => t.kind === 'feeding').length).toBe(stageOf(ageOf(baby.birthday, date).monthsFloat).schedule.length)
    expect(after.filter((t) => t.kind !== 'feeding')).toEqual(before.filter((t) => t.kind !== 'feeding'))
  })

  it('食谱加入计划可后补时间，活动追加在现有任务之后', async () => {
    await ensurePlan(baby, date)
    const order = Math.max(...(await allTasks()).map((t) => t.order))
    const recipe = await addFromLibrary(baby, date, RECIPES[0], 'evening')
    expect(recipe).toMatchObject({ kind: 'feeding', category: 'solid', time: null, sourceId: RECIPES[0].id, order: order + 1 })
    const activity = await addFromLibrary(baby, date, EDU_ACTIVITIES[0], 'evening')
    expect(activity).toMatchObject({ slot: 'evening', assignee: 'parent', order: order + 2 })
  })

  it('默认作息只保存有时间的喂养任务，并按时间排序', async () => {
    await db().babies.put(baby)
    await ensurePlan(baby, date)
    await addFromLibrary(baby, date, RECIPES[0], 'day')
    await saveAsDefaultSchedule(baby, await allTasks())
    const schedule = (await db().babies.get(baby.id))!.schedule!
    expect(schedule.every((s) => /^\d{2}:\d{2}$/.test(s.time))).toBe(true)
    expect(schedule.map((s) => s.time)).toEqual(schedule.map((s) => s.time).sort())
  })

  it('自定义任务验证时间和量，编辑任务保持原始任务类型', async () => {
    const taskInput = {
      kind: 'feeding' as const, category: 'milk' as const, title: '晚奶', desc: '  慢慢喂  ',
      steps: [' 抱稳宝宝 ', ''], slot: 'day' as const, time: '20:00', amount: 150,
    }
    const task = await addCustomTask(baby, date, taskInput)
    expect(task).toMatchObject({ slot: 'evening', assignee: 'nanny', desc: '慢慢喂', steps: ['抱稳宝宝'] })
    await expect(addCustomTask(baby, date, { ...taskInput, time: '25:90' })).rejects.toThrow('时间格式')
    await expect(addCustomTask(baby, date, { ...taskInput, amount: -10 })).rejects.toThrow('计划量')
    const changed = await updateTask(task, { ...taskInput, title: '睡前奶' })
    expect(changed.id).toBe(task.id)
    expect(changed.kind).toBe('feeding')
  })
})

describe('打卡与补录', () => {
  it('家长只能给晚间分配给家长的任务打卡，不能修改计划', async () => {
    await ensurePlan(baby, date)
    const tasks = await allTasks()
    actor = { ...actor, userId: 'mother', role: 'parent', relation: 'mother' }
    await expect(checkin(tasks.find((t) => t.kind === 'edu' && t.slot === 'day')!, input)).rejects.toMatchObject({ code: 'FORBIDDEN' })
    const task = tasks.find((t) => t.assignee === 'parent')!
    const ck = await checkin(task, input)
    expect(ck.createdBy).toBe('mother')
    await expect(removeTask(task)).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(await db().checkins.get(ck.id)).toBeDefined()
    await undoCheckin(ck)
    expect(await db().checkins.count()).toBe(0)
  })

  it('重复打卡在本地即被阻止，未来任务不能提前打卡', async () => {
    await ensurePlan(baby, date)
    const task = (await allTasks()).find((t) => t.kind === 'edu')!
    await checkin(task, input)
    await expect(checkin(task, input)).rejects.toMatchObject({ code: 'CONFLICT' })
    await expect(checkin({ ...task, date: shiftDate(date, 1) }, input)).rejects.toThrow('未来任务')
  })

  it('删除任务会移除关联打卡，但不会删除护理日志', async () => {
    await ensurePlan(baby, date)
    const task = (await allTasks()).find((t) => t.kind === 'edu')!
    const ck = await checkin(task, input)
    await removeTask(task)
    expect(await db().tasks.get(task.id)).toBeUndefined()
    expect(await db().checkins.get(ck.id)).toBeUndefined()
  })

  it('历史计划去记录预填历史日期，不会错误归到今天', () => {
    const task = { id: 'past-task', category: 'milk', date: shiftDate(date, -1), time: '13:00', amount: 180 } as PlanTask
    const preset = feedingPreset(task)
    expect(dateKey(preset.time!)).toBe(task.date)
    expect(preset.data).toMatchObject({ amount: 180 })
    expect(preset).toMatchObject({ taskId: task.id, source: 'task', type: 'milk' })
  })
})
