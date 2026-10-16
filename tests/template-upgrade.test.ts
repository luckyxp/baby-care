/* ============================================================================
 * 分类升级：使用真实版本升级流程验证内容保留、离线队列与云端删除记录。
 * ========================================================================== */
import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { afterEach, expect, it } from 'vitest'
import { CloudDB } from '@/cloud/db'
import { CloudServer } from '@/cloud/server'
import { closeClientDB, openClientDB } from '@/db/client'
import { createDailyTemplatePresets } from '@/domain/daily-template-presets'
import type { Baby, PlanTemplate, TemplateTask } from '@/shared/types'
import { uid } from '@/utils/id'
import { dateKey } from '@/utils/time'

const envelope = { familyId: 'family', createdBy: 'nanny', updatedBy: 'nanny', createdAt: 1, updatedAt: 1, deleted: 0 as const, seq: 20 }
const baby: Baby = { ...envelope, id: 'baby', name: '小米粒', gender: 'girl', birthday: '2026-01-01', feedingMode: 'mixed', birthWeight: null, birthHeight: null, allergies: '', avatar: '' }
const milk: TemplateTask = { kind: 'feeding', category: 'milk', slot: 'day', time: '07:00', amount: 180, title: '晨奶', desc: '', steps: ['按需喂养'], sourceId: null, order: 1 }
const activity: TemplateTask = { kind: 'edu', category: 'gross', slot: 'day', time: null, amount: null, title: '滚球追爬', desc: '观察追视', steps: ['滚动软球'], sourceId: 'g31', order: 2 }
const mixed = { ...envelope, id: 'custom', babyId: baby.id, name: '自建照护', tasks: [milk, activity] }
const feedOnly = { ...mixed, id: 'feed-only', tasks: [milk] }
const oldPresetId = createDailyTemplatePresets(baby)[0].id.replace(/:feeding$/, '')
const deleted = { ...mixed, id: oldPresetId, name: '已删除初始模板', tasks: [milk], deleted: 1, seq: 25 }
const resources: Dexie[] = []

afterEach(async () => {
  await closeClientDB(true)
  for (const resource of resources.splice(0)) await resource.delete()
})

async function previousCloud() {
  const name = `template-split-${uid()}`
  const previous = new Dexie(name)
  previous.version(3).stores({
    users: 'id, &phone', sessions: 'token, userId', families: 'id', mutations: 'mid, at',
    members: 'id, [familyId+seq], familyId, userId', babies: 'id, [familyId+seq], familyId',
    dailyTemplates: 'id, [familyId+seq], familyId',
  })
  await previous.table('families').put({ id: 'family', name: '小米粒的家', ownerId: 'nanny', seq: 30, createdAt: 1 })
  await previous.table('users').put({ id: 'nanny', phone: '13800000001', nickname: '王阿姨', avatar: '', salt: '', passwordHash: '', createdAt: 1 })
  await previous.table('sessions').put({ token: 'token', userId: 'nanny', createdAt: 1 })
  await previous.table('members').put({ ...envelope, id: 'member', userId: 'nanny', role: 'admin', relation: 'nanny', nickname: '王阿姨', avatar: '' })
  await previous.table('babies').put(baby)
  await previous.table('dailyTemplates').bulkPut([mixed, feedOnly, deleted])
  previous.close()
  const current = new CloudDB(name)
  resources.push(current)
  return new CloudServer(current, { post: () => {}, on: () => () => {} })
}

it('云端拆分自建内容并推进游标，已删除的阶段模板不会重新补回', async () => {
  const server = await previousCloud()
  const rows = await server.db.entity('dailyTemplates').toArray()
  expect(rows).toHaveLength(5)
  expect(rows.find((row) => row.id === 'custom:feeding')).toMatchObject({ kind: 'feeding', name: mixed.name, tasks: [milk] })
  expect(rows.find((row) => row.id === 'custom:edu')).toMatchObject({ kind: 'edu', tasks: [{ ...activity, order: 1 }] })
  expect(await server.db.families.get('family')).toMatchObject({ seq: 35 })
  const pulled = await server.pull('token', 30)
  expect(pulled.changes.filter((change) => change.entity === 'dailyTemplates').some((change) => change.record.id === 'custom:edu')).toBe(true)
  const presets = await server.db.entity('dailyTemplates').bulkGet([`${oldPresetId}:feeding`, `${oldPresetId}:edu`])
  expect(presets.every((preset) => preset?.deleted === 1)).toBe(true)
  await server.pull('token', pulled.cursor)
  expect(await server.db.entity('dailyTemplates').get('custom')).toBeUndefined()
  expect((await server.db.entity('dailyTemplates').toArray()).filter((row) => row.id.startsWith(`${oldPresetId}:`))).toHaveLength(2)
})

it('本地拆分保留护理数据和队列顺序，离线编辑与删除可在新模型下同步', async () => {
  const server = await previousCloud()
  const userId = `split-client-${uid()}`
  const previous = new Dexie(`bc_client_${userId}`)
  previous.version(3).stores({
    dailyTemplates: 'id, babyId', logs: 'id, [babyId+date], [babyId+time], [babyId+type+time]',
    plans: 'id, [babyId+date]', tasks: 'id, [babyId+date]',
    outbox: '++seqNo, mid, [entity+id]', meta: 'key',
  })
  const offline = { ...mixed, name: '离线改名', tasks: [{ ...milk, amount: 210 }, activity] }
  const newEdu = { ...mixed, id: 'offline-new', name: '离线新建早教', tasks: [activity] }
  const log = { ...envelope, id: 'offline-log', babyId: baby.id, date: dateKey(), type: 'milk', time: Date.now(), endTime: null, data: { mode: 'formula', amount: 180, duration: null, side: null }, note: '', source: 'manual', taskId: null }
  await previous.table('dailyTemplates').bulkPut([offline, newEdu])
  await previous.table('logs').put(log)
  await previous.table('plans').put({ id: 'keep-plan', babyId: baby.id, date: dateKey() })
  await previous.table('tasks').put({ id: 'keep-task', babyId: baby.id, date: dateKey(), title: '已有日期任务' })
  await previous.table('outbox').bulkAdd([
    { mid: 'log-op', entity: 'logs', op: 'put', id: log.id, data: log, at: 2 },
    { mid: 'edit-op', entity: 'dailyTemplates', op: 'put', id: offline.id, data: offline, at: 3 },
    { mid: 'delete-op', entity: 'dailyTemplates', op: 'del', id: feedOnly.id, data: null, at: 4 },
    { mid: 'new-op', entity: 'dailyTemplates', op: 'put', id: newEdu.id, data: newEdu, at: 5 },
  ])
  previous.close()
  const current = openClientDB(userId)
  const templates = await current.dailyTemplates.toArray()
  expect(templates).toHaveLength(3)
  expect(templates.find((template) => template.id === 'custom:feeding')?.tasks[0].amount).toBe(210)
  expect(await current.logs.get(log.id)).toEqual(log)
  expect(await current.plans.get('keep-plan')).toBeDefined()
  expect(await current.tasks.get('keep-task')).toMatchObject({ title: '已有日期任务' })
  const pending = await current.outbox.orderBy('seqNo').toArray()
  expect(pending.map((row) => row.mid)).toEqual(['log-op', 'edit-op:feeding', 'edit-op:edu', 'delete-op:feeding', 'delete-op:edu', 'new-op:edu'])
  expect(pending.filter((row) => row.data && row.entity === 'dailyTemplates').every((row) => row.data!.id === row.id && (row.data as PlanTemplate).kind)).toBe(true)
  const pushed = await server.push('token', pending, { silent: true })
  expect(pushed.results.every((result) => result.ok)).toBe(true)
  const stored = await server.db.entity('dailyTemplates').bulkGet(['custom:feeding', 'custom:edu', 'feed-only:feeding', 'offline-new:edu'])
  expect(stored[0]).toMatchObject({ kind: 'feeding', name: '离线改名', tasks: [{ amount: 210 }] })
  expect(stored[1]).toMatchObject({ kind: 'edu', tasks: [{ title: activity.title }] })
  expect(stored[2]?.deleted).toBe(1)
  expect(stored[3]).toMatchObject({ kind: 'edu', name: '离线新建早教' })
  const queued = await current.outbox.count()
  current.close()
  await current.open()
  expect(await current.dailyTemplates.count()).toBe(3)
  expect(await current.outbox.count()).toBe(queued)
})
