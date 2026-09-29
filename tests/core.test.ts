/* ============================================================================
 *  核心逻辑测试：模拟云端（权限 / 可见性 / 幂等）、计划生成、喂养匹配、汇报
 * ========================================================================== */

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { CloudDB } from '@/cloud/db'
import { CloudServer, type CloudEvent } from '@/cloud/server'
import { buildReport, mergeBlocks, renderReport } from '@/domain/report'
import { matchFeeding, recommendPlan } from '@/domain/planner'
import { summarizeDay } from '@/domain/stats'
import type { Bus } from '@/utils/bus'
import { sha256Fallback, sha256Hex } from '@/utils/crypto'
import { toHex, uid } from '@/utils/id'
import { ageOf, ageText, atTime } from '@/utils/time'
import type {
  AnyEntity, Baby, CareLog, Checkin, EntityName, Mutation, PlanTask, SessionInfo,
} from '@/shared/types'

/* ── 工具 ───────────────────────────────────────────────────────────────── */

const silentBus: Bus<CloudEvent> = { post: () => {}, on: () => () => {} }

function envelope(s: SessionInfo) {
  const now = Date.now()
  return {
    familyId: s.family!.id, createdBy: s.user.id, createdAt: now, updatedBy: s.user.id, updatedAt: now,
    deleted: 0 as const, seq: 0,
  }
}

const put = (entity: EntityName, data: AnyEntity): Mutation => ({ mid: uid(), entity, op: 'put', id: data.id, data, at: Date.now() })
const del = (entity: EntityName, id: string): Mutation => ({ mid: uid(), entity, op: 'del', id, data: null, at: Date.now() })

function milkLog(s: SessionInfo, babyId: string, time: number, amount = 120): CareLog {
  return {
    ...envelope(s), id: uid(), babyId, type: 'milk', date: new Date(time).toISOString().slice(0, 10), time, endTime: null,
    data: { mode: 'formula', amount, duration: null, side: null }, note: '', source: 'manual', taskId: null,
  }
}

/* ── 基础工具 ───────────────────────────────────────────────────────────── */

describe('utils', () => {
  it('sha256 纯 JS 实现与标准向量一致', async () => {
    const abc = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    expect(toHex(sha256Fallback(new TextEncoder().encode('abc')))).toBe(abc)
    expect(await sha256Hex('abc')).toBe(abc)
    const long = 'a'.repeat(1000)
    expect(toHex(sha256Fallback(new TextEncoder().encode(long)))).toBe(await sha256Hex(long))
  })

  it('月龄计算处理月末与未出生', () => {
    expect(ageOf('2026-01-31', '2026-02-28')).toMatchObject({ months: 1, days: 0 })
    expect(ageOf('2026-01-31', '2026-02-27')).toMatchObject({ months: 0, days: 27 })
    expect(ageOf('2026-04-16', '2026-09-28')).toMatchObject({ months: 5, days: 12 })
    expect(ageOf('2026-10-01', '2026-09-28').months).toBe(0)
    expect(ageText(ageOf('2024-06-28', '2026-09-28'))).toBe('2岁3个月')
  })
})

/* ── 模拟云端 ───────────────────────────────────────────────────────────── */

describe('cloud server', () => {
  let server: CloudServer
  let nanny: SessionInfo
  let mom: SessionInfo
  let baby: Baby

  beforeEach(async () => {
    server = new CloudServer(new CloudDB(`test_${uid()}`), silentBus)
    nanny = await server.register({ phone: '13800000001', password: '123456', nickname: '王阿姨' })
    nanny = await server.createFamily(nanny.token, {
      name: '小米粒', gender: 'girl', birthday: '2026-03-01', feedingMode: 'mixed', birthWeight: null, birthHeight: null, allergies: '',
    })
    const invite = await server.createInvite(nanny.token, 'mother')
    mom = await server.register({ phone: '13800000002', password: '123456', nickname: '小美' })
    mom = await server.joinFamily(mom.token, invite.code)
    const pulled = await server.pull(nanny.token, 0)
    baby = pulled.changes.find((c) => c.entity === 'babies')!.record as Baby
  })

  it('注册、登录与邀请码加入', async () => {
    expect(nanny.member?.role).toBe('admin')
    expect(mom.member).toMatchObject({ role: 'parent', relation: 'mother' })
    await expect(server.login({ phone: '13800000002', password: 'wrong!' })).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    const again = await server.login({ phone: '13800000002', password: '123456' })
    expect(again.family?.id).toBe(nanny.family?.id)
  })

  it('邀请码只能使用一次', async () => {
    const invite = await server.createInvite(nanny.token, 'father')
    const dad = await server.register({ phone: '13800000003', password: '123456', nickname: '大伟' })
    await server.joinFamily(dad.token, invite.code.toLowerCase())
    const other = await server.register({ phone: '13800000004', password: '123456', nickname: '路人' })
    await expect(server.joinFamily(other.token, invite.code)).rejects.toMatchObject({ code: 'CONFLICT' })
    await expect(server.createInvite(mom.token, 'father')).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('家长可新增日志，但不能修改育儿嫂录入的内容', async () => {
    const byNanny = milkLog(nanny, baby.id, Date.now() - 3600_000)
    const byMom = milkLog(mom, baby.id, Date.now())
    expect((await server.push(nanny.token, [put('logs', byNanny)])).results[0].ok).toBe(true)
    expect((await server.push(mom.token, [put('logs', byMom)])).results[0].ok).toBe(true)

    const tamper = await server.push(mom.token, [put('logs', { ...byNanny, data: { ...byNanny.data, amount: 999 } } as CareLog)])
    expect(tamper.results[0]).toMatchObject({ ok: false, code: 'FORBIDDEN' })
    expect((tamper.results[0].record as CareLog).data).toMatchObject({ amount: 120 })
    expect((await server.push(mom.token, [del('logs', byNanny.id)])).results[0].ok).toBe(false)

    // 育儿嫂拥有全部编辑权限
    const fix = await server.push(nanny.token, [put('logs', { ...byMom, note: '育儿嫂补充' } as CareLog)])
    expect(fix.results[0].ok).toBe(true)
  })

  it('填写人由云端认定，无法冒名', async () => {
    const forged = { ...milkLog(mom, baby.id, Date.now()), createdBy: nanny.user.id }
    await server.push(mom.token, [put('logs', forged)])
    const { changes } = await server.pull(nanny.token, 0)
    const saved = changes.find((c) => c.record.id === forged.id)!.record
    expect(saved.createdBy).toBe(mom.user.id)
  })

  it('计划只有育儿嫂能改；家长只能给晚间亲子任务打卡', async () => {
    const { plan, tasks } = recommendPlan(baby, '2026-09-28')
    const full = tasks.map((t) => ({ ...envelope(nanny), ...t, id: t.id! }) as PlanTask)
    const denied = await server.push(mom.token, [put('tasks', full[0])])
    expect(denied.results[0]).toMatchObject({ ok: false, code: 'FORBIDDEN' })
    const ok = await server.push(nanny.token, [put('plans', { ...envelope(nanny), ...plan, id: plan.id! } as AnyEntity), ...full.map((t) => put('tasks', t))])
    expect(ok.results.every((r) => r.ok)).toBe(true)

    const dayTask = full.find((t) => t.kind === 'edu')!
    const eveTask = full.find((t) => t.slot === 'evening' && t.kind === 'interaction')!
    const checkin = (task: PlanTask): Checkin => ({
      ...envelope(mom), id: uid(), babyId: baby.id, date: task.date, taskId: task.id, kind: task.kind,
      category: task.category, slot: task.slot, rating: 4, tags: [], note: '', duration: null,
    })
    expect((await server.push(mom.token, [put('checkins', checkin(dayTask))])).results[0].ok).toBe(false)
    expect((await server.push(mom.token, [put('checkins', checkin(eveTask))])).results[0].ok).toBe(true)
    // 同一任务不能重复打卡
    expect((await server.push(nanny.token, [put('checkins', checkin(eveTask))])).results[0]).toMatchObject({ ok: false, code: 'INVALID' })
  })

  it('可见性：家长看不到邀请码，消息只推给接收人', async () => {
    await server.push(nanny.token, [put('logs', milkLog(nanny, baby.id, Date.now()))])
    const momView = await server.pull(mom.token, 0)
    expect(momView.changes.some((c) => c.entity === 'invites')).toBe(false)
    const notices = momView.changes.filter((c) => c.entity === 'notices').map((c) => c.record as { recipientId: string; title: string })
    expect(notices.length).toBeGreaterThan(0)
    expect(notices.every((n) => n.recipientId === mom.user.id)).toBe(true)
    expect(notices.some((n) => n.title.includes('王阿姨记录了奶量'))).toBe(true)

    const nannyView = await server.pull(nanny.token, 0)
    expect(nannyView.changes.some((c) => c.entity === 'invites')).toBe(true)
  })

  it('同一 mid 重复推送是幂等的，增量拉取只返回新变更', async () => {
    const m = put('logs', milkLog(nanny, baby.id, Date.now()))
    const first = await server.push(nanny.token, [m])
    const second = await server.push(nanny.token, [m])
    expect(second.seq).toBe(first.seq)
    const all = await server.pull(mom.token, 0)
    const delta = await server.pull(mom.token, all.cursor)
    expect(delta.changes).toHaveLength(0)
  })

  it('被移出的成员立即失去访问权', async () => {
    const res = await server.push(nanny.token, [del('members', mom.member!.id)])
    expect(res.results[0].ok).toBe(true)
    await expect(server.pull(mom.token, 0)).rejects.toMatchObject({ code: 'NO_FAMILY' })
    // 育儿嫂不能移除自己
    expect((await server.push(nanny.token, [del('members', nanny.member!.id)])).results[0].ok).toBe(false)
  })
})

/* ── 计划 / 喂养匹配 / 汇报 ─────────────────────────────────────────────── */

describe('planner & report', () => {
  const baby: Baby = {
    id: 'b1', familyId: 'f1', createdBy: 'u1', createdAt: 0, updatedBy: 'u1', updatedAt: 0, deleted: 0, seq: 1,
    name: '小米粒', gender: 'girl', birthday: '2026-02-20', feedingMode: 'mixed', birthWeight: null, birthHeight: null,
    allergies: '', avatar: '', schedule: null,
  }

  it('同一天生成结果稳定，相邻两天自然错开', () => {
    const a = recommendPlan(baby, '2026-09-28')
    const b = recommendPlan(baby, '2026-09-28')
    const c = recommendPlan(baby, '2026-09-29')
    expect(a).toEqual(b)
    const titles = (p: typeof a) => p.tasks.filter((t) => t.kind !== 'feeding').map((t) => t.sourceId).join()
    expect(titles(a)).not.toBe(titles(c))
    expect(new Set(a.tasks.filter((t) => t.kind === 'edu').map((t) => t.category)).size).toBe(5)
    expect(a.tasks.filter((t) => t.slot === 'evening' && t.kind === 'interaction').every((t) => t.assignee === 'parent')).toBe(true)
  })

  it('喂奶记录自动匹配最近的计划时点', () => {
    const date = '2026-09-28'
    const tasks = recommendPlan(baby, date).tasks.map((t) => ({ ...t, id: t.id! }) as PlanTask)
    const milkTasks = tasks.filter((t) => t.category === 'milk')
    const target = milkTasks[1]
    const log = { ...milkLogFor(date, atTime(date, target.time!) + 20 * 60_000) }
    const matched = matchFeeding(tasks, [log])
    expect(matched.get(target.id)?.id).toBe(log.id)
    expect(matched.size).toBe(1)
  })

  it('汇报抓取喂养与睡眠数据，并保留育儿嫂改写的块', () => {
    const date = '2026-09-28'
    const logs: CareLog[] = [
      milkLogFor(date, atTime(date, '07:00'), 180),
      milkLogFor(date, atTime(date, '10:30'), 150),
      {
        ...milkLogFor(date, atTime('2026-09-27', '21:00')), type: 'sleep', date: '2026-09-27',
        endTime: atTime(date, '06:00'), data: { quality: 'good' },
      } as CareLog,
    ]
    const blocks = buildReport({ baby, date, logs, tasks: [], checkins: [], dayNotes: [], members: [], now: atTime(date, '20:00') })
    const feeding = blocks.find((b) => b.key === 'feeding')!
    expect(feeding.text).toContain('配方奶 2 次共 330ml')
    expect(blocks.find((b) => b.key === 'sleep')!.text).toContain('6小时')
    expect(summarizeDay(date, logs, atTime(date, '20:00')).sleepMin).toBe(360)

    const edited = blocks.map((b) => (b.key === 'summary' ? { ...b, text: '宝宝今天很乖', edited: true } : b))
    const merged = mergeBlocks(edited, buildReport({ baby, date, logs: logs.slice(0, 1), tasks: [], checkins: [], dayNotes: [], members: [] }))
    expect(merged.find((b) => b.key === 'summary')!.text).toBe('宝宝今天很乖')
    expect(merged.find((b) => b.key === 'feeding')!.text).toContain('配方奶 1 次')
    expect(renderReport(baby, date, merged, '王阿姨')).toMatch(/^【小米粒 · 9月28日 周一 护理日报】/)
  })

  function milkLogFor(date: string, time: number, amount = 120): CareLog {
    return {
      id: uid(), familyId: 'f1', createdBy: 'u1', createdAt: time, updatedBy: 'u1', updatedAt: time, deleted: 0, seq: 1,
      babyId: baby.id, type: 'milk', date, time, endTime: null,
      data: { mode: 'formula', amount, duration: null, side: null }, note: '', source: 'manual', taskId: null,
    }
  }
})
