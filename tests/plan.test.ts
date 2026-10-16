/* ============================================================================
 *  日模板计划测试
 * ----------------------------------------------------------------------------
 *  覆盖完整内容保存、非连续日期应用、完成记录保护和整批事务回滚。
 * ========================================================================== */

import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Actor, Baby, TemplateTask } from '@/shared/types'
import { closeClientDB, db, openClientDB } from '@/db/client'
import { bindRepo, create } from '@/db/repo'
import { applyDailyTemplate, ensurePlan, refreshUpcomingPlans, removeDailyTemplate, saveDailyTemplate } from '@/services/plan'
import { normalizeTemplateTasks } from '@/domain/plan-task'
import { createDailyTemplatePresets } from '@/domain/daily-template-presets'
import { recommendPlan } from '@/domain/planner'
import { STAGES, findLibraryItem } from '@/library'
import { atTime, dateKey, dayjs, shiftDate } from '@/utils/time'
import { uid } from '@/utils/id'

const auth = vi.hoisted(() => ({ isAdmin: true }))
vi.mock('@/stores/session', () => ({ useSession: () => auth }))

const date = dateKey()
const envelope = { familyId: 'family', createdBy: 'nanny', updatedBy: 'nanny', createdAt: 1, updatedAt: 1, deleted: 0 as const, seq: 0 }
const baby: Baby = {
  ...envelope, id: 'baby', name: '小米粒', gender: 'girl', birthday: dayjs(date).subtract(7, 'month').format('YYYY-MM-DD'),
  feedingMode: 'mixed', birthWeight: null, birthHeight: null, allergies: '', avatar: '',
}
let actor: Actor

beforeEach(() => {
  openClientDB(`daily-template-${uid()}`)
  actor = { userId: 'nanny', familyId: 'family', role: 'admin', relation: 'nanny' }
  bindRepo({ actor: () => actor, onWrite: () => {} })
})

afterEach(async () => {
  bindRepo(null)
  await closeClientDB(true)
})

const entry = (title: string, patch: Partial<TemplateTask> = {}): TemplateTask => ({
  kind: 'feeding', category: 'solid', slot: 'day', time: '12:00', title, desc: '', steps: [], sourceId: null, amount: null, order: 1, ...patch,
})
const fullDay = () => [
  entry('晨奶', { category: 'milk', time: '07:00', amount: 180 }),
  entry('午餐辅食', { steps: ['先洗手', '坐稳进食'], sourceId: 'r01' }),
  entry('维生素D', { category: 'supplement', time: '08:00' }),
  entry('喝水', { category: 'water', time: '10:00', amount: 30 }),
  entry('滚球追爬', { kind: 'edu', category: 'gross', time: null, sourceId: 'g31' }),
  entry('日间共读', { kind: 'interaction', category: 'language', time: null }),
  entry('晚间亲子', { kind: 'interaction', category: 'social', slot: 'evening', time: '20:00' }),
]
const tasksOn = (target: string) => db().tasks.where('[babyId+date]').equals([baby.id, target]).sortBy('order')
const createTask = (task: TemplateTask, target = date) => create('tasks', {
  ...task, babyId: baby.id, date: target, assignee: task.kind !== 'feeding' && task.slot === 'evening' ? 'parent' : 'nanny',
})

/* ── 模板库 ─────────────────────────────────────────────────────────────── */

describe('各月龄初始日模板', () => {
  it('覆盖全部月龄阶段，包含喂养、早教与亲子，素材符合对应月龄', () => {
    const presets = createDailyTemplatePresets(baby)
    expect(presets).toHaveLength(STAGES.length)
    presets.forEach((preset, index) => {
      const stage = STAGES[index]
      expect(preset.name).toContain(stage.range)
      expect(new Set(preset.tasks.map((task) => task.kind))).toEqual(new Set(['feeding', 'edu', 'interaction']))
      expect(preset.tasks.filter((task) => task.kind === 'feeding')).toHaveLength(stage.schedule.length)
      for (const task of preset.tasks) {
        if (!task.sourceId) continue
        const item = findLibraryItem(task.sourceId)!
        expect(item).toBeDefined()
        expect(item.min).toBeLessThanOrEqual(stage.min)
        if ('max' in item) expect(item.max).toBeGreaterThan(stage.min)
      }
    })
    expect(createDailyTemplatePresets({ ...baby, birthday: '2020-12-31' })).toEqual(presets)
  })

  it('初始模板可直接保存、编辑、应用及删除，应用后的日期保持独立', async () => {
    const preset = createDailyTemplatePresets(baby).find((template) => template.name.startsWith('10-12'))!
    const saved = await saveDailyTemplate(baby, preset.name, preset.tasks)
    const edited = await saveDailyTemplate(baby, '我的 11 月龄安排', [{ ...saved.tasks[0], title: '晨奶改为 200ml', amount: 200 }], saved.id)
    await applyDailyTemplate(baby, [date], edited)
    await removeDailyTemplate(baby, edited.id)
    expect(await db().dailyTemplates.count()).toBe(0)
    expect(await tasksOn(date)).toMatchObject([{ title: '晨奶改为 200ml', amount: 200 }])
  })
})

describe('日模板库', () => {
  it('打开日期仅创建空计划，不自动创建任务', async () => {
    await ensurePlan(baby, date)
    expect(await db().plans.count()).toBe(1)
    expect(await db().tasks.count()).toBe(0)
  })

  it('一份日模板同时保存所有喂养类别、早教与亲子内容', async () => {
    const saved = await saveDailyTemplate(baby, '  日常照护  ', fullDay())
    expect(saved.name).toBe('日常照护')
    expect(saved.tasks).toHaveLength(7)
    expect(saved.tasks.map((task) => task.order)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(saved.tasks[1]).toMatchObject({ steps: ['先洗手', '坐稳进食'], sourceId: 'r01', time: '12:00' })
    expect(await db().dailyTemplates.count()).toBe(1)
  })

  it('可修改和删除模板，编辑输入与保存内容相互独立', async () => {
    const input = fullDay()
    const saved = await saveDailyTemplate(baby, '原名称', input)
    input[1].steps.push('未保存的修改')
    expect((await db().dailyTemplates.get(saved.id))!.tasks[1].steps).toHaveLength(2)
    const updated = await saveDailyTemplate(baby, '修改后的名称', [entry('新的午餐')], saved.id)
    expect(updated.id).toBe(saved.id)
    expect(await db().dailyTemplates.count()).toBe(1)
    expect(updated.tasks.map((task) => task.title)).toEqual(['新的午餐'])
    await removeDailyTemplate(baby, saved.id)
    expect(await db().dailyTemplates.count()).toBe(0)
  })

  it('当前计划另存时仅提取内容，不携带日期、身份与打卡状态', () => {
    const recommended = recommendPlan(baby, date).tasks
    const tasks = normalizeTemplateTasks(recommended)
    expect(tasks.length).toBe(recommended.length)
    expect(tasks.every((task) => !('date' in task) && !('id' in task) && !('assignee' in task))).toBe(true)
  })

  it.each([
    ['空名称', '', [entry('午餐')]],
    ['无任务', '照护', []],
    ['错误类别', '照护', [entry('午餐', { category: 'gross' })]],
    ['错误时间', '照护', [entry('午餐', { time: '25:00' })]],
    ['错误计划量', '照护', [entry('晨奶', { category: 'milk', amount: -10 })]],
    ['空标题', '照护', [entry('   ')]],
  ] as const)('%s不能保存且不产生队列写入', async (_label, name, tasks) => {
    await expect(saveDailyTemplate(baby, name, [...tasks])).rejects.toMatchObject({ code: 'INVALID' })
    expect(await db().dailyTemplates.count()).toBe(0)
    expect(await db().outbox.count()).toBe(0)
  })

  it('不能编辑或删除其他宝宝的模板', async () => {
    const saved = await saveDailyTemplate(baby, '照护', [entry('午餐')])
    const other = { ...baby, id: 'other-baby' }
    await expect(saveDailyTemplate(other, '越权修改', [entry('晚餐')], saved.id)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(removeDailyTemplate(other, saved.id)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})

/* ── 应用到具体日期 ─────────────────────────────────────────────────────── */

describe('应用日模板', () => {
  it('只应用用户选中的非连续日期，跨月日期也互不联动', async () => {
    const template = await saveDailyTemplate(baby, '完整一天', fullDay())
    const targets = [date, shiftDate(date, 3), shiftDate(date, 40)]
    expect(await applyDailyTemplate(baby, [targets[2], targets[0], targets[1], targets[0]], template)).toBe(3)
    const tasks = await db().tasks.toArray()
    expect(await db().plans.count()).toBe(3)
    expect([...new Set(tasks.map((task) => task.date))].sort()).toEqual(targets)
    expect(tasks).toHaveLength(21)
    expect(new Set(tasks.map((task) => task.id)).size).toBe(21)
    for (const target of targets) expect((await tasksOn(target)).map((task) => task.title)).toEqual(template.tasks.map((task) => task.title))
  })

  it('保留全部内容字段，喂养由育儿嫂执行，晚间活动由家长执行', async () => {
    const template = await saveDailyTemplate(baby, '分工', [
      entry('晚奶', { category: 'milk', time: '20:00', amount: 160 }),
      entry('晚间共读', { kind: 'edu', category: 'language', slot: 'evening', sourceId: 'l01', steps: ['一起看书'] }),
    ])
    await applyDailyTemplate(baby, [date], template)
    expect(await tasksOn(date)).toMatchObject([
      { kind: 'feeding', slot: 'evening', time: '20:00', amount: 160, assignee: 'nanny' },
      { kind: 'edu', slot: 'evening', assignee: 'parent', sourceId: 'l01', steps: ['一起看书'] },
    ])
  })

  it('修改或删除模板不会回写已应用日期；不同日期任务也独立', async () => {
    const template = await saveDailyTemplate(baby, '原模板', fullDay())
    const tomorrow = shiftDate(date, 1)
    await applyDailyTemplate(baby, [date, tomorrow], template)
    await saveDailyTemplate(baby, '新模板', [entry('另一份内容')], template.id)
    await removeDailyTemplate(baby, template.id)
    const [first] = await tasksOn(date)
    await db().tasks.update(first.id, { title: '仅修改当天' })
    expect((await tasksOn(date))[0].title).toBe('仅修改当天')
    expect((await tasksOn(tomorrow))[0].title).toBe('晨奶')
    expect(await db().tasks.count()).toBe(14)
  })

  it('修改宝宝生日只刷新月龄方案，不向已应用的计划追加或改写任务', async () => {
    const template = await saveDailyTemplate(baby, '独立安排', fullDay())
    await applyDailyTemplate(baby, [date, shiftDate(date, 1)], template)
    const before = await db().tasks.toArray()
    const adjustedBaby = { ...baby, birthday: dayjs(date).subtract(15, 'month').format('YYYY-MM-DD') }
    expect(await refreshUpcomingPlans(adjustedBaby)).toBe(2)
    expect(await db().tasks.toArray()).toEqual(before)
    expect((await db().plans.toArray()).every((plan) => plan.stageKey === 'm12')).toBe(true)
  })

  it('替换未完成安排，保留已打卡任务及其打卡，且不重复添加同一已完成任务', async () => {
    const finishedInput = entry('已完成的早教', { kind: 'edu', category: 'gross', time: null })
    const finished = await createTask(finishedInput)
    const pending = await createTask(entry('旧的未完成安排'))
    await create('checkins', { babyId: baby.id, date, taskId: finished.id, kind: 'edu', category: 'gross', slot: 'day', rating: 4, tags: [], note: '玩得开心', duration: 5 })
    const template = await saveDailyTemplate(baby, '新的一天', [finishedInput, entry('新的午餐')])
    await applyDailyTemplate(baby, [date], template)
    expect(await db().tasks.get(finished.id)).toBeDefined()
    expect(await db().tasks.get(pending.id)).toBeUndefined()
    expect((await tasksOn(date)).map((task) => task.title).sort()).toEqual(['已完成的早教', '新的午餐'].sort())
    expect((await db().checkins.toArray())[0].note).toBe('玩得开心')
  })

  it.each([true, false])('保护已经记录的喂养任务（直接关联日志=%s）', async (linked) => {
    const input = entry('晨奶', { category: 'milk', time: '07:00', amount: 180 })
    const feeding = await createTask(input)
    const log = await create('logs', {
      babyId: baby.id, date, type: 'milk', time: atTime(date, '07:05'), endTime: null,
      data: { mode: 'formula', amount: 180, duration: null, side: null }, note: '已喝完', source: 'manual', taskId: linked ? feeding.id : null,
    })
    const template = await saveDailyTemplate(baby, '照护', [input, entry('午餐')])
    await applyDailyTemplate(baby, [date], template)
    expect(await db().tasks.get(feeding.id)).toBeDefined()
    expect(await db().logs.get(log.id)).toEqual(log)
    expect(await db().tasks.count()).toBe(2)
  })

  it('不修改未选中日期、历史记录和其他宝宝的安排', async () => {
    const unselected = await createTask(entry('其他日期安排'), shiftDate(date, 2))
    const history = await createTask(entry('历史安排'), shiftDate(date, -1))
    const other = await create('tasks', { ...entry('其他宝宝'), babyId: 'other-baby', date, assignee: 'nanny' })
    const template = await saveDailyTemplate(baby, '照护', [entry('午餐')])
    await applyDailyTemplate(baby, [date], template)
    expect(await db().tasks.bulkGet([unselected.id, history.id, other.id])).toEqual([unselected, history, other])
  })

  it.each([
    { label: '未选择日期', dates: [] },
    { label: '过去日期', dates: [shiftDate(date, -1)] },
    { label: '不存在的日期', dates: ['2027-02-30'] },
    { label: '错误日期格式', dates: ['bad-date'] },
  ])('拒绝$label，整批不写入', async ({ dates }) => {
    const template = await saveDailyTemplate(baby, '照护', [entry('午餐')])
    await expect(applyDailyTemplate(baby, dates, template)).rejects.toMatchObject({ code: 'INVALID' })
    expect(await db().tasks.count()).toBe(0)
    expect(await db().plans.count()).toBe(0)
  })

  it('后一个日期写入失败时，前一个日期的替换和离线队列一起回滚', async () => {
    const original = await createTask(entry('待替换的安排'))
    const template = await saveDailyTemplate(baby, '照护', [entry('午餐')])
    const queued = await db().outbox.count()
    let calls = 0
    bindRepo({ actor: () => ++calls >= 5 ? null : actor, onWrite: () => {} })
    await expect(applyDailyTemplate(baby, [date, shiftDate(date, 1)], template)).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    expect(await db().plans.count()).toBe(0)
    expect(await db().tasks.toArray()).toEqual([original])
    expect(await db().outbox.count()).toBe(queued)
  })

  it('家长不能保存、删除或应用日模板', async () => {
    const template = await saveDailyTemplate(baby, '照护', [entry('午餐')])
    actor = { userId: 'mother', familyId: 'family', role: 'parent', relation: 'mother' }
    await expect(saveDailyTemplate(baby, '越权模板', fullDay())).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(removeDailyTemplate(baby, template.id)).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(applyDailyTemplate(baby, [date], template)).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(await db().tasks.count()).toBe(0)
    expect(await db().dailyTemplates.count()).toBe(1)
  })
})

/* ── 存储升级 ───────────────────────────────────────────────────────────── */

it('替换旧模板存储时保留护理日志，并清除已废弃实体的待上传操作', async () => {
  await closeClientDB(true)
  const userId = `daily-upgrade-${uid()}`
  const previous = new Dexie(`bc_client_${userId}`)
  previous.version(2).stores({ logs: 'id, [babyId+date], [babyId+time], [babyId+type+time]', plans: 'id, [babyId+date]', templates: 'id, babyId', outbox: '++seqNo, mid, [entity+id]', meta: 'key' })
  await previous.table('logs').put({ id: 'preserved-log', babyId: baby.id, date })
  await previous.table('plans').put({ id: 'preserved-plan', babyId: baby.id, date })
  await previous.table('templates').put({ id: 'retired-template', babyId: baby.id, tasks: [] })
  await previous.table('outbox').bulkAdd([{ entity: 'templates', id: 'retired-template', mid: 'old' }, { entity: 'logs', id: 'preserved-log', mid: 'keep' }])
  previous.close()
  const current = openClientDB(userId)
  expect(await current.logs.get('preserved-log')).toBeDefined()
  expect(await current.plans.get('preserved-plan')).toBeDefined()
  expect(current.tables.some((table) => table.name === 'templates')).toBe(false)
  expect(await current.dailyTemplates.count()).toBe(0)
  expect((await current.outbox.toArray()).map((row) => row.mid)).toEqual(['keep'])
})
