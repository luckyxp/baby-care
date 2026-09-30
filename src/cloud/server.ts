/* ============================================================================
 *  模拟云端 · 服务层
 * ----------------------------------------------------------------------------
 *  扮演未来真实后端的全部职责：账号、家庭、邀请码、权限裁决、变更序号、
 *  增量拉取、消息分发。接口形状即 HTTP API 契约（见 docs/DESIGN.md）。
 *
 *  写入流水线（push 中的每条 Mutation）：
 *
 *    幂等检查 ─▶ 归属校验 ─▶ 权限裁决 ─▶ 字段白名单 ─▶ 业务校验 ─▶ 分配 seq
 *        │                                                        │
 *        └── 命中则直接返回首次结果                                  ▼
 *                                                   落库 ─▶ 推导消息 ─▶ 广播
 * ========================================================================== */

import type { Table } from 'dexie'
import { LOG_TYPES, RELATION_LABEL, memberLabel } from '@/shared/constants'
import { ApiError } from '@/shared/errors'
import { MUTABLE_FIELDS, authorize, visible } from '@/shared/policy'
import {
  ENTITY_NAMES,
  type Actor, type AnyEntity, type Baby, type BabyInput, type CareLog, type Change, type Checkin,
  type EntityName, type Family, type Invite, type InvitePreview, type Member, type Mutation,
  type MutationResult, type Note, type PlanTask, type PullResponse, type PushResponse,
  type RejectCode, type SessionInfo, type UserProfile,
} from '@/shared/types'
import { createBus, type Bus } from '@/utils/bus'
import { sha256Hex } from '@/utils/crypto'
import { inviteCode, token as newToken, uid } from '@/utils/id'
import { CloudDB, type UserRow } from './db'
import { deriveNotice, type NoticeDraft } from './notify'

export interface CloudEvent {
  familyId: string
  seq: number
}

export const CLOUD_CHANNEL = 'bc-cloud'

const INVITE_TTL = 7 * 24 * 3600 * 1000
const PROTECTED = new Set(['id', 'familyId', 'createdBy', 'createdAt', 'updatedBy', 'updatedAt', 'deleted', 'seq'])
const BABY_SCOPED = new Set<EntityName>(['logs', 'notes', 'plans', 'tasks', 'checkins', 'reports', 'templates'])

interface Ctx {
  user: UserRow
  member: Member
  actor: Actor
}

type AnyTable = Table<AnyEntity, string>

const profileOf = ({ id, phone, nickname, avatar }: UserRow): UserProfile => ({ id, phone, nickname, avatar })

const actorOf = (m: Member): Actor => ({ userId: m.userId, familyId: m.familyId, role: m.role, relation: m.relation })

function envelope(familyId: string, userId: string, at = Date.now()) {
  return { id: uid(), familyId, createdBy: userId, createdAt: at, updatedBy: userId, updatedAt: at, deleted: 0 as const }
}

function reject(m: Mutation, code: RejectCode, message: string, record: AnyEntity | null = null): MutationResult {
  return { mid: m.mid, ok: false, code, message, record }
}

export class CloudServer {
  readonly db: CloudDB
  private readonly bus: Bus<CloudEvent>

  constructor(db: CloudDB, bus: Bus<CloudEvent>) {
    this.db = db
    this.bus = bus
  }

  /* ── 账号 ─────────────────────────────────────────────────────────────── */

  async register(p: { phone: string; password: string; nickname: string }): Promise<SessionInfo> {
    const phone = p.phone.trim()
    const nickname = p.nickname.trim().slice(0, 12)
    if (!/^1\d{10}$/.test(phone)) {
      throw new ApiError('INVALID', '请输入 11 位手机号')
    }
    if (p.password.length < 6) {
      throw new ApiError('INVALID', '密码至少 6 位')
    }
    if (!nickname) {
      throw new ApiError('INVALID', '请填写昵称')
    }
    if (await this.db.users.where('phone').equals(phone).count()) {
      throw new ApiError('CONFLICT', '该手机号已注册，请直接登录')
    }
    const salt = newToken()
    const user: UserRow = {
      id: uid(), phone, nickname, avatar: '', salt,
      passwordHash: await sha256Hex(`${salt}:${p.password}`),
      createdAt: Date.now(),
    }
    await this.db.users.add(user)
    return this.issue(user)
  }

  async login(p: { phone: string; password: string }): Promise<SessionInfo> {
    const user = await this.db.users.where('phone').equals(p.phone.trim()).first()
    if (!user || user.passwordHash !== (await sha256Hex(`${user.salt}:${p.password}`))) {
      throw new ApiError('UNAUTHORIZED', '手机号或密码错误')
    }
    return this.issue(user)
  }

  async me(token: string): Promise<SessionInfo> {
    return this.info(token, await this.userOf(token))
  }

  async logout(token: string): Promise<void> {
    await this.db.sessions.delete(token)
  }

  async updateProfile(token: string, p: { nickname: string; avatar: string }): Promise<SessionInfo> {
    const user = await this.userOf(token)
    const nickname = p.nickname.trim().slice(0, 12)
    if (!nickname) {
      throw new ApiError('INVALID', '昵称不能为空')
    }
    await this.db.users.update(user.id, { nickname, avatar: p.avatar })
    const member = await this.memberOf(user.id)
    if (member) {
      await this.commit(member.familyId, async (next) => {
        await this.db.members.put({ ...member, nickname, avatar: p.avatar, updatedBy: user.id, updatedAt: Date.now(), seq: next() })
      })
    }
    return this.me(token)
  }

  /* ── 家庭与邀请 ───────────────────────────────────────────────────────── */

  async createFamily(token: string, baby: BabyInput): Promise<SessionInfo> {
    const user = await this.userOf(token)
    if (await this.memberOf(user.id)) {
      throw new ApiError('CONFLICT', '你已加入一个家庭')
    }
    if (!baby.name.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(baby.birthday)) {
      throw new ApiError('INVALID', '请填写宝宝姓名与生日')
    }
    const family: Family = { id: uid(), name: `${baby.name.trim()}的家`, ownerId: user.id, seq: 0, createdAt: Date.now() }
    await this.db.families.add(family)
    await this.commit(family.id, async (next) => {
      await this.db.members.add({
        ...envelope(family.id, user.id), seq: next(),
        userId: user.id, role: 'admin', relation: 'nanny', nickname: user.nickname, avatar: user.avatar,
      })
      await this.db.entity('babies').add({
        ...envelope(family.id, user.id), seq: next(),
        ...baby, name: baby.name.trim(), avatar: '', schedule: null,
      })
    })
    return this.info(token, user)
  }

  async createInvite(token: string, relation: Invite['relation']): Promise<Invite> {
    const { actor } = await this.ctxOf(token)
    if (actor.role !== 'admin') {
      throw new ApiError('FORBIDDEN', '只有育儿嫂可以邀请成员')
    }
    let code = inviteCode()
    while (await this.db.entity('invites').where('code').equals(code).count()) {
      code = inviteCode()
    }
    return this.commit(actor.familyId, async (next) => {
      const now = Date.now()
      const invite: Invite = {
        ...envelope(actor.familyId, actor.userId, now), seq: next(),
        code, relation, expiresAt: now + INVITE_TTL, usedBy: null, usedAt: null,
      }
      await this.db.entity('invites').add(invite)
      return invite
    })
  }

  async previewInvite(code: string): Promise<InvitePreview> {
    const invite = await this.validInvite(code)
    const family = await this.db.families.get(invite.familyId)
    const members = await this.db.members.where('familyId').equals(invite.familyId).toArray()
    const babies = await this.db.entity('babies').where('familyId').equals(invite.familyId).toArray()
    const inviter = members.find((m) => m.userId === invite.createdBy)
    return {
      familyName: family?.name ?? '',
      babyName: babies.filter((b) => !b.deleted).map((b) => b.name).join('、'),
      relation: invite.relation,
      inviter: inviter ? memberLabel(inviter) : RELATION_LABEL.nanny,
      expiresAt: invite.expiresAt,
    }
  }

  async joinFamily(token: string, code: string): Promise<SessionInfo> {
    const user = await this.userOf(token)
    if (await this.memberOf(user.id)) {
      throw new ApiError('CONFLICT', '你已加入一个家庭')
    }
    const invite = await this.validInvite(code)
    await this.commit(invite.familyId, async (next) => {
      // 事务内二次校验，防止同一邀请码被并发使用
      const fresh = await this.db.entity('invites').get(invite.id)
      if (!fresh || fresh.deleted || fresh.usedBy) {
        throw new ApiError('CONFLICT', '邀请码已被使用')
      }
      const now = Date.now()
      const member: Member = {
        ...envelope(invite.familyId, user.id, now), seq: next(),
        userId: user.id, role: 'parent', relation: invite.relation, nickname: user.nickname, avatar: user.avatar,
      }
      await this.db.members.add(member)
      await this.db.entity('invites').put({ ...fresh, usedBy: user.id, usedAt: now, updatedBy: user.id, updatedAt: now, seq: next() })
      const admins = (await this.db.members.where('familyId').equals(invite.familyId).toArray())
        .filter((m) => !m.deleted && m.role === 'admin')
      await this.writeNotices(actorOf(member), {
        title: `${RELATION_LABEL[invite.relation]}加入了家庭`,
        body: `${user.nickname} 已通过邀请码加入，现在可以实时查看宝宝的动态了`,
        level: 'important',
        link: '/members',
        to: admins,
      }, next)
    })
    return this.info(token, user)
  }

  /* ── 同步 ─────────────────────────────────────────────────────────────── */

  /** silent 仅供演示数据初始化使用：批量导入历史数据时不产生消息 */
  async push(token: string, mutations: Mutation[], opts: { silent?: boolean } = {}): Promise<PushResponse> {
    const { actor } = await this.ctxOf(token)
    const results: MutationResult[] = []
    await this.commit(actor.familyId, async (next) => {
      for (const m of mutations) {
        const done = await this.db.mutations.get(m.mid)
        if (done) {
          results.push(done.result)
          continue
        }
        const result = await this.apply(actor, m, next, opts.silent ?? false)
        await this.db.mutations.add({ mid: m.mid, userId: actor.userId, result, at: Date.now() })
        results.push(result)
      }
    })
    const family = await this.db.families.get(actor.familyId)
    return { results, seq: family?.seq ?? 0 }
  }

  async pull(token: string, cursor: number): Promise<PullResponse> {
    const { actor } = await this.ctxOf(token)
    return this.db.transaction('r', this.tables(), async () => {
      const top = (await this.db.families.get(actor.familyId))?.seq ?? 0
      const changes: Change[] = []
      if (cursor >= top) {
        return { changes, cursor: top, hasMore: false }
      }
      for (const name of ENTITY_NAMES) {
        const rows = await this.table(name)
          .where('[familyId+seq]')
          .between([actor.familyId, cursor + 1], [actor.familyId, top], true, true)
          .toArray()
        for (const record of rows) {
          if (visible(name, actor, record as never)) {
            changes.push({ entity: name, record })
          }
        }
      }
      changes.sort((a, b) => a.record.seq - b.record.seq)
      return { changes, cursor: top, hasMore: false }
    })
  }

  /* ── 内部：单条变更 ───────────────────────────────────────────────────── */

  private async apply(actor: Actor, m: Mutation, next: () => number, silent: boolean): Promise<MutationResult> {
    if (!ENTITY_NAMES.includes(m.entity)) {
      return reject(m, 'INVALID', '未知的数据类型')
    }
    const table = this.table(m.entity)
    const prev = await table.get(m.id)
    if (prev && prev.familyId !== actor.familyId) {
      return reject(m, 'FORBIDDEN', '无权访问该记录')
    }
    const alive = prev && !prev.deleted ? prev : undefined

    if (m.op === 'del') {
      if (!alive) {
        return { mid: m.mid, ok: true }
      }
      if (!authorize(m.entity, { actor, op: 'delete', prev: alive as never })) {
        return reject(m, 'FORBIDDEN', '没有删除权限', alive)
      }
      await table.put({ ...alive, deleted: 1, updatedBy: actor.userId, updatedAt: m.at, seq: next() })
      return { mid: m.mid, ok: true }
    }

    const data = m.data
    if (!data || data.id !== m.id) {
      return reject(m, 'INVALID', '数据不完整', alive ?? null)
    }
    if (prev?.deleted) {
      return reject(m, 'NOT_FOUND', '该记录已被删除')
    }

    let rec: AnyEntity
    if (!alive) {
      const task = m.entity === 'checkins' ? await this.db.entity('tasks').get((data as Checkin).taskId) : null
      if (!authorize(m.entity, { actor, op: 'create', task })) {
        return reject(m, 'FORBIDDEN', '没有新增权限')
      }
      rec = {
        ...data,
        familyId: actor.familyId,
        createdBy: actor.userId,
        createdAt: Math.min(data.createdAt || m.at, Date.now()),
        updatedBy: actor.userId,
        updatedAt: m.at,
        deleted: 0,
        seq: 0,
      }
    } else {
      if (!authorize(m.entity, { actor, op: 'update', prev: alive as never })) {
        return reject(m, 'FORBIDDEN', '没有修改权限', alive)
      }
      const fields = MUTABLE_FIELDS[m.entity]
      const patch = Object.fromEntries(
        Object.entries(data).filter(([k]) => (fields ? fields.includes(k) : !PROTECTED.has(k))),
      )
      rec = { ...alive, ...patch, updatedBy: actor.userId, updatedAt: m.at, seq: 0 } as AnyEntity
    }

    const invalid = await this.validate(actor, m.entity, rec)
    if (invalid) {
      return reject(m, 'INVALID', invalid, alive ?? null)
    }
    rec.seq = next()
    await table.put(rec)

    if (!silent) {
      const draft = await deriveNotice(this.db, actor, m.entity, rec, alive)
      if (draft) {
        await this.writeNotices(actor, draft, next)
      }
    }
    return { mid: m.mid, ok: true }
  }

  private async validate(actor: Actor, entity: EntityName, rec: AnyEntity): Promise<string | null> {
    if (BABY_SCOPED.has(entity)) {
      const babyId = (rec as { babyId?: string }).babyId
      const baby = babyId ? await this.db.entity('babies').get(babyId) : undefined
      if (!baby || baby.deleted || baby.familyId !== actor.familyId) {
        return '宝宝档案不存在'
      }
    }
    switch (entity) {
      case 'babies': {
        const b = rec as Baby
        if (!b.name?.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(b.birthday)) {
          return '请填写宝宝姓名与生日'
        }
        return null
      }
      case 'logs': {
        const l = rec as CareLog
        if (!LOG_TYPES.includes(l.type) || typeof l.time !== 'number' || !l.data) {
          return '记录格式不正确'
        }
        return null
      }
      case 'notes':
        return (rec as Note).content?.trim() ? null : '备注内容不能为空'
      case 'tasks':
        return (rec as PlanTask).title?.trim() ? null : '任务标题不能为空'
      case 'checkins': {
        const ck = rec as Checkin
        const task = await this.db.entity('tasks').get(ck.taskId)
        if (!task || task.deleted || task.familyId !== actor.familyId) {
          return '任务不存在或已被移除'
        }
        const dup = await this.db.entity('checkins')
          .where('familyId').equals(actor.familyId)
          .filter((x) => !x.deleted && x.taskId === ck.taskId && x.id !== ck.id)
          .count()
        return dup ? '该任务已经打过卡了' : null
      }
      default:
        return null
    }
  }

  private async writeNotices(actor: Actor, draft: NoticeDraft, next: () => number): Promise<void> {
    const now = Date.now()
    for (const to of draft.to) {
      await this.db.entity('notices').add({
        ...envelope(actor.familyId, actor.userId, now), seq: next(),
        recipientId: to.userId, level: draft.level, title: draft.title, body: draft.body, link: draft.link, readAt: null,
      })
    }
  }

  /* ── 内部：事务与身份 ─────────────────────────────────────────────────── */

  /** 在单个读写事务中执行 fn，并为其中的每次写入分配家庭内单调递增的 seq */
  private async commit<T>(familyId: string, fn: (next: () => number) => Promise<T>): Promise<T> {
    let seq = 0
    let dirty = false
    const out = await this.db.transaction('rw', this.tables(), async () => {
      const family = await this.db.families.get(familyId)
      if (!family) {
        throw new ApiError('NOT_FOUND', '家庭不存在')
      }
      seq = family.seq
      const result = await fn(() => {
        dirty = true
        return ++seq
      })
      if (dirty) {
        await this.db.families.update(familyId, { seq })
      }
      return result
    })
    if (dirty) {
      this.bus.post({ familyId, seq })
    }
    return out
  }

  private tables(): Table[] {
    return [this.db.families, this.db.mutations, ...ENTITY_NAMES.map((n) => this.db.table(n))]
  }

  private table(name: EntityName): AnyTable {
    return this.db.table(name) as AnyTable
  }

  private async issue(user: UserRow): Promise<SessionInfo> {
    const token = newToken()
    await this.db.sessions.add({ token, userId: user.id, createdAt: Date.now() })
    return this.info(token, user)
  }

  private async info(token: string, user: UserRow): Promise<SessionInfo> {
    const member = await this.memberOf(user.id)
    const family = member ? (await this.db.families.get(member.familyId)) ?? null : null
    return { token, user: profileOf(user), family, member: member ?? null }
  }

  private async userOf(token: string): Promise<UserRow> {
    const session = token ? await this.db.sessions.get(token) : undefined
    const user = session ? await this.db.users.get(session.userId) : undefined
    if (!user) {
      throw new ApiError('UNAUTHORIZED', '登录已失效，请重新登录')
    }
    return user
  }

  private async memberOf(userId: string): Promise<Member | undefined> {
    return this.db.members.where('userId').equals(userId).filter((m) => !m.deleted).first()
  }

  private async ctxOf(token: string): Promise<Ctx> {
    const user = await this.userOf(token)
    const member = await this.memberOf(user.id)
    if (!member) {
      throw new ApiError('NO_FAMILY', '你还没有加入家庭，或已被移出')
    }
    return { user, member, actor: actorOf(member) }
  }

  private async validInvite(code: string): Promise<Invite> {
    const invite = await this.db.entity('invites').where('code').equals(code.trim().toUpperCase()).first()
    if (!invite || invite.deleted) {
      throw new ApiError('NOT_FOUND', '邀请码不存在或已被撤销')
    }
    if (invite.usedBy) {
      throw new ApiError('CONFLICT', '邀请码已被使用')
    }
    if (invite.expiresAt < Date.now()) {
      throw new ApiError('INVALID', '邀请码已过期，请让育儿嫂重新生成')
    }
    return invite
  }
}

/* ── 单例 ───────────────────────────────────────────────────────────────── */

let instance: CloudServer | null = null

export function cloud(): CloudServer {
  instance ??= new CloudServer(new CloudDB(), createBus<CloudEvent>(CLOUD_CHANNEL))
  return instance
}
