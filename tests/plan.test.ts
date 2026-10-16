/* ============================================================================
 * 分类日模板：验证两类独立应用、完成记录保护、权限与整批事务。
 * ========================================================================== */
import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Actor, Baby, TemplateKind, TemplateTask } from '@/shared/types'
import { closeClientDB, db, openClientDB } from '@/db/client'
import { bindRepo, create } from '@/db/repo'
import { applyDailyTemplate, applyDailyTemplateEveryDay, clearCareData, ensurePlan, refreshUpcomingPlans, removeDailyTemplate, saveDailyTemplate, stopDailyTemplateEveryDay } from '@/services/plan'
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
afterEach(async () => { bindRepo(null); await closeClientDB(true) })

const entry = (title: string, patch: Partial<TemplateTask> = {}): TemplateTask => ({
  kind: 'feeding', category: 'solid', slot: 'day', time: '12:00', title, desc: '', steps: [], sourceId: null, amount: null, order: 1, ...patch,
})
const feeding = () => [
  entry('晨奶', { category: 'milk', time: '07:00', amount: 180 }),
  entry('午餐辅食', { steps: ['先洗手', '坐稳进食'], sourceId: 'r01' }),
  entry('维生素D', { category: 'supplement', time: '08:00' }),
  entry('喝水', { category: 'water', time: '10:00', amount: 30 }),
]
const education = () => [
  entry('滚球追爬', { kind: 'edu', category: 'gross', time: null, sourceId: 'g31' }),
  entry('日间共读', { kind: 'interaction', category: 'language', time: null }),
  entry('晚间亲子', { kind: 'interaction', category: 'social', slot: 'evening', time: '20:00' }),
]
const tasksOn = (target: string) => db().tasks.where('[babyId+date]').equals([baby.id, target]).sortBy('order')
const createTask = (task: TemplateTask, target = date) => create('tasks', {
  ...task, babyId: baby.id, date: target, assignee: task.kind !== 'feeding' && task.slot === 'evening' ? 'parent' : 'nanny',
})

/* ── 无截止日期的每日应用 ───────────────────────────────────────────────── */
describe('今天及以后每天应用', () => {
  it('立即替换今天和所有已安排未来日期，包括一年后；保留历史与其他宝宝', async () => {
    const far = shiftDate(date, 740)
    const history = await createTask(entry('历史安排'), shiftDate(date, -1))
    const other = await create('tasks', { ...entry('其他宝宝'), babyId: 'other-baby', date, assignee: 'nanny' })
    await createTask(entry('旧的未来安排'), far)
    const edu = await createTask(education()[0], far)
    const template = await saveDailyTemplate(baby, { kind: 'feeding', name: '每日喂养', tasks: feeding() })
    await applyDailyTemplateEveryDay(baby, template)
    expect((await tasksOn(date)).map((task) => task.title)).toEqual(feeding().map((task) => task.title))
    expect((await tasksOn(far)).filter((task) => task.kind === 'feeding')).toHaveLength(4)
    expect(await db().tasks.bulkGet([history.id, other.id, edu.id])).toEqual([history, other, edu])
    expect(await db().plans.count()).toBe(2)
    expect((await db().templateSchedules.toArray())[0]).toMatchObject({ active: true, startDate: date, templateId: template.id })
  })

  it('未来任意日期按需生成，重复、并发打开均不重复写入，重开数据库后继续生效', async () => {
    const template = await saveDailyTemplate(baby, { kind: 'feeding', name: '每天', tasks: feeding() })
    await applyDailyTemplateEveryDay(baby, template)
    const current = db()
    const future = shiftDate(date, 1500)
    current.close()
    await current.open()
    await Promise.all([ensurePlan(baby, future), ensurePlan(baby, future), ensurePlan(baby, future)])
    const before = await tasksOn(future)
    const queued = await db().outbox.count()
    await ensurePlan(baby, future)
    expect(before).toHaveLength(4)
    expect(await tasksOn(future)).toEqual(before)
    expect(await db().outbox.count()).toBe(queued)
    expect(await db().plans.count()).toBe(2)
  })

  it.each([['feeding', 'edu'], ['edu', 'feeding']] as const)('按 %s → %s 设置每日规则，两类长期共存', async (first, second) => {
    const templates = {
      feeding: await saveDailyTemplate(baby, { kind: 'feeding', name: '每天喂养', tasks: feeding() }),
      edu: await saveDailyTemplate(baby, { kind: 'edu', name: '每天早教', tasks: education() }),
    }
    await applyDailyTemplateEveryDay(baby, templates[first])
    const original = await tasksOn(date)
    await applyDailyTemplateEveryDay(baby, templates[second])
    expect(await db().tasks.bulkGet(original.map((task) => task.id))).toEqual(original)
    const future = shiftDate(date, 500)
    await ensurePlan(baby, future)
    const tasks = await tasksOn(future)
    expect(tasks.filter((task) => task.kind === 'feeding')).toHaveLength(4)
    expect(tasks.filter((task) => task.kind !== 'feeding')).toHaveLength(3)
    expect(tasks.find((task) => task.slot === 'evening')).toMatchObject({ assignee: 'parent' })
    expect(Object.keys((await db().plans.where('[babyId+date]').equals([baby.id, future]).first())!.templateRevisions!)).toHaveLength(2)
  })

  it('具体日期可覆盖每日模板，重新打开不会覆盖单日编辑或补回已删任务', async () => {
    const template = await saveDailyTemplate(baby, { kind: 'feeding', name: '每天', tasks: feeding() })
    await applyDailyTemplateEveryDay(baby, template)
    const future = shiftDate(date, 3)
    await applyDailyTemplate(baby, [future], { ...template, tasks: [entry('这天特殊午餐'), entry('手动删除')] })
    const [edited, removed] = await tasksOn(future)
    await db().tasks.update(edited.id, { title: '当天改过的午餐' })
    await db().tasks.delete(removed.id)
    await ensurePlan(baby, future)
    expect(await tasksOn(future)).toMatchObject([{ id: edited.id, title: '当天改过的午餐' }])
    const revised = await saveDailyTemplate(baby, { ...template, tasks: [entry('新每日午餐')] }, template.id)
    await applyDailyTemplateEveryDay(baby, revised)
    expect(await tasksOn(future)).toMatchObject([{ title: '新每日午餐' }])
  })

  it('每日规则保留应用时快照，编辑模板后需重新应用才改变后续安排', async () => {
    const template = await saveDailyTemplate(baby, { kind: 'feeding', name: '原模板', tasks: [entry('原午餐')] })
    await applyDailyTemplateEveryDay(baby, template)
    await saveDailyTemplate(baby, { ...template, tasks: [entry('改过的午餐')] }, template.id)
    await ensurePlan(baby, shiftDate(date, 2))
    expect(await tasksOn(shiftDate(date, 2))).toMatchObject([{ title: '原午餐' }])
  })

  it('替换每日规则仍保留已打卡任务、日志和另一类安排', async () => {
    const input = education()[0]
    const completed = await createTask(input)
    const checkin = await create('checkins', { babyId: baby.id, date, taskId: completed.id, kind: 'edu', category: 'gross', slot: 'day', rating: 4, tags: [], note: '保留', duration: 5 })
    const feed = await createTask(feeding()[0])
    const template = await saveDailyTemplate(baby, { kind: 'edu', name: '每日早教', tasks: education() })
    await applyDailyTemplateEveryDay(baby, template)
    expect(await db().tasks.bulkGet([completed.id, feed.id])).toEqual([completed, feed])
    expect(await db().checkins.get(checkin.id)).toEqual(checkin)
    expect(await tasksOn(date)).toHaveLength(4)
  })

  it('停止某类后保留已有日程，另一类仍生成；可以重新启用', async () => {
    const feed = await saveDailyTemplate(baby, { kind: 'feeding', name: '喂养', tasks: feeding() })
    const edu = await saveDailyTemplate(baby, { kind: 'edu', name: '早教', tasks: education() })
    await applyDailyTemplateEveryDay(baby, feed)
    await applyDailyTemplateEveryDay(baby, edu)
    const before = await tasksOn(date)
    await stopDailyTemplateEveryDay(baby, 'feeding')
    await ensurePlan(baby, shiftDate(date, 1))
    expect(await tasksOn(date)).toEqual(before)
    expect((await tasksOn(shiftDate(date, 1))).every((task) => task.kind !== 'feeding')).toBe(true)
    await applyDailyTemplateEveryDay(baby, feed)
    expect(await tasksOn(shiftDate(date, 1))).toHaveLength(7)
    expect(await db().templateSchedules.count()).toBe(2)
  })

  it('删除正在每日应用的模板或清除护理数据时，停止后续自动安排', async () => {
    const feed = await saveDailyTemplate(baby, { kind: 'feeding', name: '喂养', tasks: feeding() })
    await applyDailyTemplateEveryDay(baby, feed)
    const before = await tasksOn(date)
    await removeDailyTemplate(baby, feed.id)
    expect(await tasksOn(date)).toEqual(before)
    await ensurePlan(baby, shiftDate(date, 1))
    expect(await tasksOn(shiftDate(date, 1))).toHaveLength(0)
    const edu = await saveDailyTemplate(baby, { kind: 'edu', name: '早教', tasks: education() })
    await applyDailyTemplateEveryDay(baby, edu)
    await clearCareData(baby)
    await ensurePlan(baby, shiftDate(date, 2))
    expect(await db().tasks.count()).toBe(0)
    expect((await db().templateSchedules.toArray()).every((schedule) => !schedule.active)).toBe(true)
  })

  it('中途失败时每日规则、日期替换与离线队列一起回滚', async () => {
    const original = await createTask(entry('未来原安排'), shiftDate(date, 1))
    const template = await saveDailyTemplate(baby, { kind: 'feeding', name: '喂养', tasks: [entry('新午餐')] })
    const queued = await db().outbox.count()
    let calls = 0
    bindRepo({ actor: () => ++calls >= 5 ? null : actor, onWrite: () => {} })
    await expect(applyDailyTemplateEveryDay(baby, template)).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    expect(await db().templateSchedules.count()).toBe(0)
    expect(await db().plans.count()).toBe(0)
    expect(await db().tasks.toArray()).toEqual([original])
    expect(await db().outbox.count()).toBe(queued)
  })

  it('拒绝其他宝宝、跨分类内容和家长修改每日规则', async () => {
    const template = await saveDailyTemplate(baby, { kind: 'feeding', name: '喂养', tasks: feeding() })
    await expect(applyDailyTemplateEveryDay({ ...baby, id: 'other' }, template)).rejects.toMatchObject({ code: 'INVALID' })
    await expect(applyDailyTemplateEveryDay(baby, { ...template, tasks: education() })).rejects.toMatchObject({ code: 'INVALID' })
    await applyDailyTemplateEveryDay(baby, template)
    const before = await db().templateSchedules.toArray()
    actor = { userId: 'mother', familyId: 'family', role: 'parent', relation: 'mother' }
    await expect(applyDailyTemplateEveryDay(baby, template)).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(stopDailyTemplateEveryDay(baby, 'feeding')).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(await db().templateSchedules.toArray()).toEqual(before)
  })
})

/* ── 分类与内容 ─────────────────────────────────────────────────────────── */
describe('分类日模板库', () => {
  it('所有月龄各有一份喂养和早教模板，素材符合对应月龄', () => {
    const presets = createDailyTemplatePresets(baby)
    expect(presets).toHaveLength(STAGES.length * 2)
    STAGES.forEach((stage) => {
      const pair = presets.filter((preset) => preset.name.startsWith(`${stage.range} ·`))
      expect(pair.map((preset) => preset.kind)).toEqual(['feeding', 'edu'])
      expect(pair[0].tasks).toHaveLength(stage.schedule.length)
      expect(pair[0].tasks.every((task) => task.kind === 'feeding')).toBe(true)
      expect(new Set(pair[1].tasks.map((task) => task.kind))).toEqual(new Set(['edu', 'interaction']))
      for (const task of pair.flatMap((preset) => preset.tasks)) {
        if (!task.sourceId) continue
        const item = findLibraryItem(task.sourceId)!
        expect(item).toBeDefined()
        expect(item.min).toBeLessThanOrEqual(stage.min)
        if ('max' in item) expect(item.max).toBeGreaterThan(stage.min)
      }
    })
    expect(createDailyTemplatePresets({ ...baby, birthday: '2020-12-31' })).toEqual(presets)
  })

  it('初始模板可保存、编辑、应用及删除，已应用的日期独立保留', async () => {
    const preset = createDailyTemplatePresets(baby).find((template) => template.kind === 'feeding' && template.name.startsWith('10-12'))!
    const saved = await saveDailyTemplate(baby, preset)
    const edited = await saveDailyTemplate(baby, { kind: 'feeding', name: '11 月龄喂养', tasks: [{ ...saved.tasks[0], title: '晨奶 200ml', amount: 200 }] }, saved.id)
    await applyDailyTemplate(baby, [date], edited)
    await removeDailyTemplate(baby, edited.id)
    expect(await db().dailyTemplates.count()).toBe(0)
    expect(await tasksOn(date)).toMatchObject([{ title: '晨奶 200ml', amount: 200 }])
  })

  it('喂养保留所有喂养类别，早教同时容纳日间与晚间亲子', async () => {
    const feed = await saveDailyTemplate(baby, { kind: 'feeding', name: '  日常喂养  ', tasks: feeding() })
    const edu = await saveDailyTemplate(baby, { kind: 'edu', name: '早教与陪伴', tasks: education() })
    expect(feed.name).toBe('日常喂养')
    expect(feed.tasks.map((task) => task.order)).toEqual([1, 2, 3, 4])
    expect(feed.tasks[1]).toMatchObject({ steps: ['先洗手', '坐稳进食'], sourceId: 'r01' })
    expect(edu.tasks).toHaveLength(3)
    expect(edu.tasks[2]).toMatchObject({ kind: 'interaction', slot: 'evening' })
    expect(await db().dailyTemplates.count()).toBe(2)
  })

  it('编辑与输入相互独立，删除一类模板不会删另一类', async () => {
    const tasks = feeding()
    const feed = await saveDailyTemplate(baby, { kind: 'feeding', name: '原名称', tasks })
    const edu = await saveDailyTemplate(baby, { kind: 'edu', name: '早教', tasks: education() })
    tasks[1].steps.push('未保存的修改')
    expect((await db().dailyTemplates.get(feed.id))!.tasks[1].steps).toHaveLength(2)
    const updated = await saveDailyTemplate(baby, { kind: 'feeding', name: '新的名称', tasks: [entry('新的午餐')] }, feed.id)
    expect(updated.id).toBe(feed.id)
    await removeDailyTemplate(baby, feed.id)
    expect(await db().dailyTemplates.toArray()).toEqual([edu])
  })

  it('打开日期仅建空计划，不自动填充任何一类任务', async () => {
    await ensurePlan(baby, date)
    expect(await db().plans.count()).toBe(1)
    expect(await db().tasks.count()).toBe(0)
  })

  it.each(['feeding', 'edu'] as const)('当前计划提取 %s 内容时不携带日期、身份与打卡状态', (kind) => {
    const scoped = recommendPlan(baby, date).tasks.filter((task) => (task.kind === 'feeding') === (kind === 'feeding'))
    const tasks = normalizeTemplateTasks(scoped, kind)
    expect(tasks).toHaveLength(scoped.length)
    expect(tasks.every((task) => !('date' in task) && !('id' in task) && !('assignee' in task))).toBe(true)
  })

  it.each([
    ['空名称', '', [entry('午餐')]], ['无任务', '喂养', []],
    ['错误类别', '喂养', [entry('午餐', { category: 'gross' })]],
    ['错误时间', '喂养', [entry('午餐', { time: '25:00' })]],
    ['错误计划量', '喂养', [entry('晨奶', { category: 'milk', amount: -10 })]],
    ['空标题', '喂养', [entry('   ')]],
  ] as const)('%s不能保存且不产生队列写入', async (_label, name, tasks) => {
    await expect(saveDailyTemplate(baby, { kind: 'feeding', name, tasks: [...tasks] })).rejects.toMatchObject({ code: 'INVALID' })
    expect(await db().dailyTemplates.count()).toBe(0)
    expect(await db().outbox.count()).toBe(0)
  })

  it.each(['feeding', 'edu'] as const)('拒绝混入另一类任务的 %s 模板', async (kind) => {
    await expect(saveDailyTemplate(baby, { kind, name: '混合', tasks: [...feeding(), ...education()] })).rejects.toMatchObject({ code: 'INVALID' })
    expect(await db().outbox.count()).toBe(0)
  })

  it('不能用修改模板的方式改变分类，也不能应用伪造的混合模板', async () => {
    const template = await saveDailyTemplate(baby, { kind: 'feeding', name: '喂养', tasks: feeding() })
    await expect(saveDailyTemplate(baby, { kind: 'edu', name: '改类', tasks: education() }, template.id)).rejects.toMatchObject({ code: 'INVALID' })
    await expect(applyDailyTemplate(baby, [date], { ...template, tasks: [...feeding(), ...education()] })).rejects.toMatchObject({ code: 'INVALID' })
    await expect(saveDailyTemplate(baby, { kind: 'invalid' as TemplateKind, name: '无效类型', tasks: feeding() })).rejects.toMatchObject({ code: 'INVALID' })
    expect(await db().tasks.count()).toBe(0)
  })

  it('不能编辑、删除或应用其他宝宝的模板', async () => {
    const template = await saveDailyTemplate(baby, { kind: 'feeding', name: '喂养', tasks: feeding() })
    const other = { ...baby, id: 'other-baby' }
    await expect(saveDailyTemplate(other, { kind: 'feeding', name: '越权', tasks: feeding() }, template.id)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(removeDailyTemplate(other, template.id)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(applyDailyTemplate(other, [date], template)).rejects.toMatchObject({ code: 'INVALID' })
  })
})

/* ── 独立应用与完成记录 ─────────────────────────────────────────────────── */
describe('分别应用喂养与早教模板', () => {
  it.each([['feeding', 'edu'], ['edu', 'feeding']] as const)('按 %s → %s 顺序应用后，同一天的两类安排共存', async (first, second) => {
    const feed = await saveDailyTemplate(baby, { kind: 'feeding', name: '喂养', tasks: feeding() })
    const edu = await saveDailyTemplate(baby, { kind: 'edu', name: '早教', tasks: education() })
    const templates = { feeding: feed, edu }
    await applyDailyTemplate(baby, [date], templates[first])
    const before = await db().tasks.toArray()
    await applyDailyTemplate(baby, [date], templates[second])
    expect(await db().tasks.bulkGet(before.map((task) => task.id))).toEqual(before)
    expect(await db().tasks.count()).toBe(7)
    await applyDailyTemplate(baby, [date], templates[second])
    expect(await db().tasks.bulkGet(before.map((task) => task.id))).toEqual(before)
    expect(await db().tasks.count()).toBe(7)
  })

  it.each(['feeding', 'edu'] as const)('重用 %s 模板只替换同类未完成任务，另一类与其队列不变', async (kind) => {
    const original = await Promise.all([...feeding(), ...education()].map((task) => createTask(task)))
    const untouched = original.filter((task) => (task.kind === 'feeding') !== (kind === 'feeding'))
    const replaced = original.filter((task) => !untouched.includes(task))
    const queued = await db().outbox.count()
    const tasks = kind === 'feeding' ? [entry('新的午餐')] : [education()[0]]
    const template = await saveDailyTemplate(baby, { kind, name: '替换', tasks })
    await applyDailyTemplate(baby, [date], template)
    expect(await db().tasks.bulkGet(untouched.map((task) => task.id))).toEqual(untouched)
    expect(await db().tasks.bulkGet(replaced.map((task) => task.id))).toEqual(replaced.map(() => undefined))
    const added = (await db().outbox.toArray()).slice(queued).filter((row) => row.entity === 'tasks')
    expect(added.every((row) => !untouched.some((task) => task.id === row.id))).toBe(true)
  })

  it('非连续跨月日期均独立应用两类模板，不影响未选中日期', async () => {
    const feed = await saveDailyTemplate(baby, { kind: 'feeding', name: '喂养', tasks: feeding() })
    const edu = await saveDailyTemplate(baby, { kind: 'edu', name: '早教', tasks: education() })
    const targets = [date, shiftDate(date, 3), shiftDate(date, 40)]
    expect(await applyDailyTemplate(baby, [targets[2], targets[0], targets[1], targets[0]], feed)).toBe(3)
    await applyDailyTemplate(baby, targets, edu)
    expect(await db().plans.count()).toBe(3)
    const tasks = await db().tasks.toArray()
    expect(tasks).toHaveLength(21)
    expect(new Set(tasks.map((task) => task.id)).size).toBe(21)
    expect([...new Set(tasks.map((task) => task.date))].sort()).toEqual(targets)
  })

  it('喂养由育儿嫂执行，晚间早教与亲子仍由家长执行', async () => {
    const feed = await saveDailyTemplate(baby, { kind: 'feeding', name: '喂养', tasks: [entry('晚奶', { category: 'milk', time: '20:00', amount: 160 })] })
    const edu = await saveDailyTemplate(baby, { kind: 'edu', name: '陪伴', tasks: [entry('晚间共读', { kind: 'edu', category: 'language', slot: 'evening', sourceId: 'l01', steps: ['一起看书'] })] })
    await applyDailyTemplate(baby, [date], feed)
    await applyDailyTemplate(baby, [date], edu)
    expect((await db().tasks.toArray()).find((task) => task.kind === 'feeding')).toMatchObject({ slot: 'evening', time: '20:00', amount: 160, assignee: 'nanny' })
    expect((await db().tasks.toArray()).find((task) => task.kind === 'edu')).toMatchObject({ assignee: 'parent', sourceId: 'l01', steps: ['一起看书'] })
  })

  it('编辑、删除模板和调整宝宝生日，都不会改写已应用的任务', async () => {
    const template = await saveDailyTemplate(baby, { kind: 'feeding', name: '喂养', tasks: feeding() })
    const tomorrow = shiftDate(date, 1)
    await applyDailyTemplate(baby, [date, tomorrow], template)
    const before = await db().tasks.toArray()
    await saveDailyTemplate(baby, { kind: 'feeding', name: '新的名称', tasks: [entry('另一份内容')] }, template.id)
    await removeDailyTemplate(baby, template.id)
    expect(await refreshUpcomingPlans({ ...baby, birthday: dayjs(date).subtract(15, 'month').format('YYYY-MM-DD') })).toBe(2)
    expect(await db().tasks.toArray()).toEqual(before)
    expect((await db().plans.toArray()).every((plan) => plan.stageKey === 'm12')).toBe(true)
    const [first] = await tasksOn(date)
    await db().tasks.update(first.id, { title: '仅修改当天' })
    expect((await tasksOn(tomorrow))[0].title).toBe('晨奶')
  })

  it('应用早教保留打卡及其备注，不重复复制已完成活动，也不影响待喂养', async () => {
    const input = education()[0]
    const finished = await createTask(input)
    const pending = await createTask(education()[1])
    const milk = await createTask(feeding()[0])
    const checkin = await create('checkins', { babyId: baby.id, date, taskId: finished.id, kind: 'edu', category: 'gross', slot: 'day', rating: 4, tags: [], note: '玩得开心', duration: 5 })
    const note = await create('notes', { babyId: baby.id, date, targetType: 'task', targetId: finished.id, content: '继续观察' })
    const template = await saveDailyTemplate(baby, { kind: 'edu', name: '早教', tasks: [input, education()[2]] })
    await applyDailyTemplate(baby, [date], template)
    expect(await db().tasks.get(finished.id)).toEqual(finished)
    expect(await db().tasks.get(pending.id)).toBeUndefined()
    expect(await db().tasks.get(milk.id)).toEqual(milk)
    expect(await db().checkins.get(checkin.id)).toEqual(checkin)
    expect(await db().notes.get(note.id)).toEqual(note)
    expect(await db().tasks.count()).toBe(3)
  })

  it.each([true, false])('应用喂养保留已记录的任务（直接关联日志=%s），不影响未完成早教', async (linked) => {
    const input = feeding()[0]
    const milk = await createTask(input)
    const edu = await createTask(education()[0])
    const log = await create('logs', {
      babyId: baby.id, date, type: 'milk', time: atTime(date, '07:05'), endTime: null,
      data: { mode: 'formula', amount: 180, duration: null, side: null }, note: '已喝完', source: 'manual', taskId: linked ? milk.id : null,
    })
    const template = await saveDailyTemplate(baby, { kind: 'feeding', name: '喂养', tasks: [input, entry('午餐')] })
    await applyDailyTemplate(baby, [date], template)
    expect(await db().tasks.bulkGet([milk.id, edu.id])).toEqual([milk, edu])
    expect(await db().logs.get(log.id)).toEqual(log)
    expect(await db().tasks.count()).toBe(3)
  })

  it('未选中日期、历史记录和其他宝宝保持原样', async () => {
    const unselected = await createTask(entry('其他日期'), shiftDate(date, 2))
    const history = await createTask(entry('历史'), shiftDate(date, -1))
    const other = await create('tasks', { ...entry('其他宝宝'), babyId: 'other-baby', date, assignee: 'nanny' })
    const template = await saveDailyTemplate(baby, { kind: 'feeding', name: '喂养', tasks: feeding() })
    await applyDailyTemplate(baby, [date], template)
    expect(await db().tasks.bulkGet([unselected.id, history.id, other.id])).toEqual([unselected, history, other])
  })

  it.each([[], [shiftDate(date, -1)], ['2027-02-30'], ['bad-date']])('拒绝无效日期 %j，整批不写入', async (...dates) => {
    const template = await saveDailyTemplate(baby, { kind: 'feeding', name: '喂养', tasks: feeding() })
    await expect(applyDailyTemplate(baby, dates as string[], template)).rejects.toMatchObject({ code: 'INVALID' })
    expect(await db().tasks.count()).toBe(0)
    expect(await db().plans.count()).toBe(0)
  })

  it('后一日期写入失败时，全部替换和队列回滚，另一类也保持不变', async () => {
    const original = await createTask(entry('待替换'))
    const edu = await createTask(education()[0])
    const template = await saveDailyTemplate(baby, { kind: 'feeding', name: '喂养', tasks: [entry('午餐')] })
    const queued = await db().outbox.count()
    let calls = 0
    bindRepo({ actor: () => ++calls >= 5 ? null : actor, onWrite: () => {} })
    await expect(applyDailyTemplate(baby, [date, shiftDate(date, 1)], template)).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    expect(await db().plans.count()).toBe(0)
    expect((await db().tasks.toArray()).sort((a, b) => a.id.localeCompare(b.id))).toEqual([original, edu].sort((a, b) => a.id.localeCompare(b.id)))
    expect(await db().outbox.count()).toBe(queued)
  })

  it('家长不能保存、删除或应用任何分类模板', async () => {
    const template = await saveDailyTemplate(baby, { kind: 'feeding', name: '喂养', tasks: feeding() })
    actor = { userId: 'mother', familyId: 'family', role: 'parent', relation: 'mother' }
    await expect(saveDailyTemplate(baby, { kind: 'edu', name: '越权', tasks: education() })).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(removeDailyTemplate(baby, template.id)).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(applyDailyTemplate(baby, [date], template)).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(await db().tasks.count()).toBe(0)
  })
})

it('替换旧周模板存储时保留护理日志，并移除已废弃实体的待上传操作', async () => {
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
