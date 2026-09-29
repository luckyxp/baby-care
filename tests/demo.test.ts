/* ============================================================================
 *  演示数据：幂等初始化、三方账号可登录、家长视角的数据与未读消息
 * ========================================================================== */

import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { CloudDB } from '@/cloud/db'
import { CloudServer, type CloudEvent } from '@/cloud/server'
import { DEMO_ACCOUNTS, ensureDemo, resetDemo } from '@/cloud/demo'
import type { Notice } from '@/shared/types'
import type { Bus } from '@/utils/bus'
import { uid } from '@/utils/id'

const silentBus: Bus<CloudEvent> = { post: () => {}, on: () => () => {} }

describe('demo seed', () => {
  const server = new CloudServer(new CloudDB(`demo_${uid()}`), silentBus)

  it('重复初始化是幂等的', async () => {
    await ensureDemo(server)
    const users = await server.db.users.count()
    const logs = await server.db.entity('logs').count()
    await ensureDemo(server)
    expect(await server.db.users.count()).toBe(users)
    expect(await server.db.entity('logs').count()).toBe(logs)
    expect(users).toBe(3)
  })

  it('三个演示账号都能登录，且同属一个家庭', async () => {
    const infos = await Promise.all(DEMO_ACCOUNTS.map((a) => server.login(a)))
    expect(infos.map((i) => i.member?.relation)).toEqual(['nanny', 'mother', 'father'])
    expect(new Set(infos.map((i) => i.family?.id)).size).toBe(1)
  })

  it('家长能看到日志、计划、打卡、汇报，并有未读消息', async () => {
    const mom = await server.login(DEMO_ACCOUNTS[1])
    const { changes } = await server.pull(mom.token, 0)
    const count = (e: string) => changes.filter((c) => c.entity === e && !c.record.deleted).length
    expect(count('logs')).toBeGreaterThan(100)
    expect(count('tasks')).toBeGreaterThan(40)
    expect(count('checkins')).toBeGreaterThan(10)
    expect(count('reports')).toBe(6)
    expect(count('invites')).toBe(0)
    const notices = changes.filter((c) => c.entity === 'notices').map((c) => c.record as Notice)
    expect(notices.filter((n) => !n.readAt).length).toBeGreaterThanOrEqual(2)
    expect(notices.every((n) => n.recipientId === mom.user.id)).toBe(true)
  })

  it('进行中的睡眠最多一条，所有记录时间不晚于现在', async () => {
    const logs = await server.db.entity('logs').toArray()
    expect(logs.filter((l) => l.type === 'sleep' && l.endTime === null).length).toBeLessThanOrEqual(1)
    expect(logs.every((l) => l.time <= Date.now())).toBe(true)
  })

  it('重置后重新生成一份演示家庭', async () => {
    const before = (await server.login(DEMO_ACCOUNTS[0])).family?.id
    await resetDemo(server)
    const after = await server.login(DEMO_ACCOUNTS[0])
    expect(after.family?.id).toBeTruthy()
    expect(after.family?.id).not.toBe(before)
    expect(await server.db.families.count()).toBe(1)
  })
})
