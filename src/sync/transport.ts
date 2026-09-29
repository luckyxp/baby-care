/* ============================================================================
 *  传输层 · Transport
 * ----------------------------------------------------------------------------
 *  客户端与"云"之间唯一的通道。现阶段由 LocalTransport 直连浏览器内的模拟云；
 *  接入真实后端时，实现同一接口的 HttpTransport（fetch + WebSocket/SSE）并在
 *  本文件底部替换导出即可，业务代码零改动。
 *
 *  LocalTransport 刻意模拟网络特性：
 *    · 离线时抛出 NETWORK 错误（触发离线队列）
 *    · 入参 / 出参经过 JSON 序列化（与 HTTP 行为一致，也隔离了响应式代理）
 * ========================================================================== */

import { ApiError } from '@/shared/errors'
import type {
  BabyInput, Invite, InvitePreview, Mutation, PullResponse, PushResponse, SessionInfo,
} from '@/shared/types'
import { createBus } from '@/utils/bus'
import { CLOUD_CHANNEL, cloud, type CloudEvent } from '@/cloud/server'
import { isOnline } from './network'

export interface Transport {
  register(p: { phone: string; password: string; nickname: string }): Promise<SessionInfo>
  login(p: { phone: string; password: string }): Promise<SessionInfo>
  me(token: string): Promise<SessionInfo>
  logout(token: string): Promise<void>
  updateProfile(token: string, p: { nickname: string; avatar: string }): Promise<SessionInfo>
  createFamily(token: string, baby: BabyInput): Promise<SessionInfo>
  createInvite(token: string, relation: Invite['relation']): Promise<Invite>
  previewInvite(code: string): Promise<InvitePreview>
  joinFamily(token: string, code: string): Promise<SessionInfo>
  push(token: string, mutations: Mutation[]): Promise<PushResponse>
  pull(token: string, cursor: number): Promise<PullResponse>
  /** 实时通道：家庭数据有变更时回调 */
  subscribe(fn: (e: CloudEvent) => void): () => void
}

const wire = <T>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T))

function call<A extends unknown[], R>(fn: (...args: A) => Promise<R>) {
  return async (...args: A): Promise<R> => {
    if (!isOnline()) {
      throw new ApiError('NETWORK', '网络不可用')
    }
    return wire(await fn(...wire(args)))
  }
}

function createLocalTransport(): Transport {
  const server = cloud()
  // 独立的总线实例：BroadcastChannel 不回送给发送者本身，另开一个才能收到本页的广播
  const events = createBus<CloudEvent>(CLOUD_CHANNEL)
  return {
    register: call(server.register.bind(server)),
    login: call(server.login.bind(server)),
    me: call(server.me.bind(server)),
    logout: call(server.logout.bind(server)),
    updateProfile: call(server.updateProfile.bind(server)),
    createFamily: call(server.createFamily.bind(server)),
    createInvite: call(server.createInvite.bind(server)),
    previewInvite: call(server.previewInvite.bind(server)),
    joinFamily: call(server.joinFamily.bind(server)),
    push: call((token: string, mutations: Mutation[]) => server.push(token, mutations)),
    pull: call(server.pull.bind(server)),
    subscribe: (fn) => events.on(fn),
  }
}

export const transport: Transport = createLocalTransport()
