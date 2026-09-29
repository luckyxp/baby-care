/* ============================================================================
 *  会话 Store
 * ----------------------------------------------------------------------------
 *  负责：登录态恢复（离线可用）、账号/家庭/成员身份、当前宝宝、本地库切换。
 *
 *  会话存储策略：sessionStorage 优先、localStorage 兜底 ——
 *  手机上"一次登录长期有效"；电脑上可在不同标签页登录不同角色，演示三方同步。
 * ========================================================================== */

import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { isApiError } from '@/shared/errors'
import type {
  Actor, Baby, BabyInput, Family, Invite, Member, SessionInfo, UserProfile,
} from '@/shared/types'
import { bindRepo } from '@/db/repo'
import { closeClientDB, db, getMeta, openClientDB, setMeta } from '@/db/client'
import { useLive } from '@/db/live'
import { engine } from '@/sync/engine'
import { transport } from '@/sync/transport'

const SESSION_KEY = 'bc.session'
const BABY_KEY = 'bc.baby'

interface StoredSession {
  token: string
  userId: string
}

function readStored(): StoredSession | null {
  const raw = sessionStorage.getItem(SESSION_KEY) ?? localStorage.getItem(SESSION_KEY)
  try {
    return raw ? (JSON.parse(raw) as StoredSession) : null
  } catch {
    return null
  }
}

function writeStored(s: StoredSession | null): void {
  if (s) {
    const raw = JSON.stringify(s)
    sessionStorage.setItem(SESSION_KEY, raw)
    localStorage.setItem(SESSION_KEY, raw)
    return
  }
  const mine = sessionStorage.getItem(SESSION_KEY)
  sessionStorage.removeItem(SESSION_KEY)
  if (localStorage.getItem(SESSION_KEY) === mine) {
    localStorage.removeItem(SESSION_KEY)
  }
}

export const useSession = defineStore('session', () => {
  const token = ref('')
  const user = ref<UserProfile | null>(null)
  const family = ref<Family | null>(null)
  const member = ref<Member | null>(null)
  const ready = ref(false)
  /** 被移出家庭 / 登录失效时的提示语，由界面层消费后清空 */
  const kickedReason = ref('')
  const babyId = ref(localStorage.getItem(BABY_KEY) ?? '')

  const members = useLive(() => db().members.toArray(), [] as Member[])
  const babies = useLive(
    async () => (await db().babies.toArray()).filter((b) => !b.deleted).sort((a, b) => a.createdAt - b.createdAt),
    [] as Baby[],
  )

  /* ── 派生 ───────────────────────────────────────────────────────────── */

  const actor = computed<Actor | null>(() =>
    member.value && !member.value.deleted
      ? { userId: member.value.userId, familyId: member.value.familyId, role: member.value.role, relation: member.value.relation }
      : null,
  )
  const isAdmin = computed(() => actor.value?.role === 'admin')
  const baby = computed<Baby | null>(() => babies.value.find((b) => b.id === babyId.value) ?? babies.value[0] ?? null)
  const activeMembers = computed(() => members.value.filter((m) => !m.deleted))
  const memberOf = (userId: string) => members.value.find((m) => m.userId === userId)

  // 本人成员记录以本地库为准：改昵称、被移出都能实时感知
  watch(members, (list) => {
    const mine = list.find((m) => m.userId === user.value?.id && m.familyId === family.value?.id)
    if (!mine) {
      return
    }
    if (mine.deleted) {
      void onKicked('你已被移出家庭')
    } else {
      member.value = mine
    }
  })

  /* ── 会话生命周期 ───────────────────────────────────────────────────── */

  async function apply(info: SessionInfo, persist = true): Promise<void> {
    openClientDB(info.user.id)
    // 家庭发生变化（被移出 / 加入新家庭）时清空本地副本：数据只留在当前家庭成员的设备上
    const familyId = info.family?.id ?? null
    const lastFamily = await getMeta<string | null>('familyId')
    if (lastFamily && lastFamily !== familyId) {
      engine.stop()
      await closeClientDB(true)
      openClientDB(info.user.id)
    }
    token.value = info.token
    user.value = info.user
    family.value = info.family
    member.value = info.member
    writeStored({ token: info.token, userId: info.user.id })
    await setMeta('familyId', familyId)
    if (persist) {
      await setMeta('session', info)
    }
    if (info.family && info.member) {
      bindRepo({ actor: () => actor.value, onWrite: () => engine.schedule() })
      engine.start(info.token, info.family.id)
    } else {
      bindRepo(null)
      engine.stop()
    }
  }

  async function bootstrap(): Promise<void> {
    if (ready.value) {
      return
    }
    const stored = readStored()
    if (stored) {
      openClientDB(stored.userId)
      const cached = await getMeta<SessionInfo>('session')
      if (cached?.token === stored.token) {
        await apply(cached, false)
      }
      try {
        await apply(await transport.me(stored.token))
      } catch (e) {
        if (isApiError(e, 'UNAUTHORIZED')) {
          await reset()
        } else if (!cached) {
          token.value = stored.token // 离线且无缓存：保留令牌，联网后重试
        }
      }
    }
    ready.value = true
  }

  async function reset(erase = false): Promise<void> {
    engine.stop()
    bindRepo(null)
    await closeClientDB(erase)
    writeStored(null)
    token.value = ''
    user.value = null
    family.value = null
    member.value = null
  }

  async function onKicked(reason: string): Promise<void> {
    if (!user.value) {
      return
    }
    kickedReason.value = reason
    try {
      await apply(await transport.me(token.value))
    } catch (e) {
      if (isApiError(e, 'UNAUTHORIZED')) {
        await reset()
      }
    }
  }

  /* ── 动作 ───────────────────────────────────────────────────────────── */

  async function login(phone: string, password: string): Promise<void> {
    await apply(await transport.login({ phone, password }))
  }

  async function register(p: { phone: string; password: string; nickname: string }): Promise<void> {
    await apply(await transport.register(p))
  }

  async function createFamily(input: BabyInput): Promise<void> {
    await apply(await transport.createFamily(token.value, input))
  }

  async function joinFamily(code: string): Promise<void> {
    await apply(await transport.joinFamily(token.value, code))
  }

  async function createInvite(relation: Invite['relation']): Promise<Invite> {
    const invite = await transport.createInvite(token.value, relation)
    engine.schedule(0)
    return invite
  }

  async function updateProfile(p: { nickname: string; avatar: string }): Promise<void> {
    await apply(await transport.updateProfile(token.value, p))
  }

  async function logout(erase = false): Promise<void> {
    try {
      await transport.logout(token.value)
    } catch {
      // 离线登出：本地清理即可，云端会话会自然失效
    }
    await reset(erase)
  }

  function switchBaby(id: string): void {
    babyId.value = id
    localStorage.setItem(BABY_KEY, id)
  }

  return {
    token, user, family, member, ready, kickedReason, babyId, members, babies,
    actor, isAdmin, baby, activeMembers, memberOf,
    bootstrap, onKicked, login, register, createFamily, joinFamily, createInvite, updateProfile, logout, switchBaby,
  }
})
