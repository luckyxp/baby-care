<!-- ==========================================================================
  家庭成员：本地角色权限演示、生成与撤销邀请码、移除成员
=========================================================================== -->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { showConfirmDialog } from 'vant'
import PageNav from '@/components/PageNav.vue'
import InviteSheet from '@/components/family/InviteSheet.vue'
import { RELATION_AVATAR, RELATION_COLOR, RELATION_LABEL, memberLabel } from '@/shared/constants'
import type { Invite, Member } from '@/shared/types'
import { db } from '@/db/client'
import { useLive } from '@/db/live'
import { remove } from '@/db/repo'
import { useSession } from '@/stores/session'
import { useAction } from '@/composables/useAction'
import { useClock } from '@/composables/useClock'
import { dayjs } from '@/utils/time'

const session = useSession()
const { now } = useClock()
const { busy, run } = useAction()
const selected = ref<Invite | null>(null)
const showInvite = ref(false)
const allInvites = useLive(() => db().invites.toArray(), [] as Invite[])
const invites = computed(() => allInvites.value.filter((i) => !i.deleted && !i.usedBy).sort((a, b) => b.createdAt - a.createdAt))

function contact(m: Member) {
  if (m.userId !== session.user?.id) {
    return '未提供联系方式'
  }
  return session.user.phone.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2')
}

async function invite(relation: Invite['relation']) {
  const result = await run(() => session.createInvite(relation))
  if (result) {
    selected.value = result
    showInvite.value = true
  }
}

async function revoke(i: Invite) {
  try {
    await showConfirmDialog({ title: '撤销邀请码', message: `撤销后 ${i.code} 将无法继续使用，确认撤销吗？` })
  } catch {
    return
  }
  await run(() => remove('invites', i.id), '已撤销')
}

async function removeMember(m: Member) {
  try {
    await showConfirmDialog({
      title: `移出${RELATION_LABEL[m.relation]}`,
      message: '确认将该成员移出本机演示家庭吗？其历史记录仍然保留，界面不再允许该成员访问。本地模拟不构成真实跨设备安全隔离。',
      confirmButtonColor: 'var(--bc-danger)',
    })
  } catch {
    return
  }
  await run(() => remove('members', m.id), '已移出')
}

function remaining(i: Invite) {
  const hours = Math.ceil((i.expiresAt - now.value) / 3_600_000)
  return hours <= 0 ? '已过期' : hours >= 24 ? `剩余 ${Math.ceil(hours / 24)} 天` : `剩余 ${hours} 小时`
}
</script>

<template>
  <div class="page members-page">
    <PageNav />
    <div class="page-body">
      <div class="family-heading">
        <div class="family-mark" aria-hidden="true">🏡</div>
        <div><h1>{{ session.family?.name }}</h1><p class="muted">{{ session.activeMembers.length }} 位成员，一起照顾宝宝</p></div>
      </div>
      <div class="local-note"><van-icon name="info-o" /> 纯静态本机演示 · 仅同一浏览器的同源标签页可共享</div>

      <section class="card">
        <div v-for="m in session.activeMembers" :key="m.id" class="member-row">
          <div class="avatar" :style="{ background: RELATION_COLOR[m.relation] + '18' }">{{ m.avatar || RELATION_AVATAR[m.relation] }}</div>
          <div class="grow">
            <div class="row"><strong>{{ memberLabel(m) }}</strong><span v-if="m.userId === session.user?.id" class="muted">我</span><span class="pill" :class="m.role === 'admin' ? 'pill--primary' : ''">{{ m.role === 'admin' ? '管理员' : '家长' }}</span></div>
            <div class="details">{{ m.relation === 'nanny' ? '育儿嫂' : m.nickname }} · {{ contact(m) }}</div>
            <div class="joined">{{ dayjs(m.createdAt).format('YYYY.M.D') }} 加入</div>
          </div>
          <button v-if="session.isAdmin && m.userId !== session.user?.id" type="button" class="remove" :disabled="busy" @click="removeMember(m)">移出</button>
        </div>
        <p v-if="!session.isAdmin" class="muted small">成员与邀请码由育儿嫂管理。</p>
      </section>

      <template v-if="session.isAdmin">
        <div class="invite-actions">
          <van-button round plain type="primary" :loading="busy" @click="invite('father')">👨 邀请爸爸</van-button>
          <van-button round type="primary" :loading="busy" @click="invite('mother')">👩 邀请妈妈</van-button>
        </div>
        <div v-if="invites.length" class="section-title">尚未使用的邀请码</div>
        <section v-if="invites.length" class="card">
          <div v-for="i in invites" :key="i.id" class="invite-row">
            <button type="button" class="invite-entry grow" @click="selected = i; showInvite = true">
              <strong>{{ i.code }}</strong><span>{{ RELATION_LABEL[i.relation] }} · {{ remaining(i) }}</span>
            </button>
            <button type="button" class="remove" :disabled="busy" @click="revoke(i)">撤销</button>
          </div>
        </section>
      </template>

      <div class="section-title">谁可以做什么</div>
      <section class="card permissions">
        <h3>🧑‍🍼 育儿嫂 · 管理员</h3>
        <p>创建与编辑宝宝档案、管理成员、调整计划、编辑护理记录、发布每日汇报。</p>
        <h3>👨‍👩‍👧 爸爸妈妈 · 家长</h3>
        <p>查看记录和计划、补充备注、完成留给家长的晚间亲子任务。不能修改育儿嫂录入的内容或计划，不能管理成员。</p>
        <p class="muted small">以上是本机交互权限演示，不是真实账号鉴权或服务器侧访问控制。当前不要录入敏感个人信息；真实多端协作与隐私隔离需接入后端。</p>
      </section>
    </div>
    <InviteSheet v-model:show="showInvite" :invite="selected" />
  </div>
</template>

<style scoped>
.family-heading { display: flex; align-items: center; gap: 14px; padding: 22px 4px 16px; }
.family-mark { width: 54px; height: 54px; display: grid; place-items: center; border-radius: 18px; font-size: 30px; background: var(--bc-primary-soft); }
h1 { margin: 0; font-size: 21px; }
.family-heading p { margin: 3px 0 0; font-size: 13px; }
.local-note { display: flex; align-items: center; gap: 6px; padding: 12px; margin-bottom: 16px; border-radius: 12px; background: var(--bc-warn-soft); font-size: 12px; color: var(--bc-text-2); }
.member-row { display: flex; align-items: center; gap: 10px; padding: 14px 0; border-bottom: 1px solid var(--bc-border); }
.member-row:first-child { padding-top: 0; }
.member-row:last-child { border-bottom: 0; padding-bottom: 0; }
.avatar { flex: none; display: grid; place-items: center; width: 44px; height: 44px; font-size: 26px; border-radius: 14px; }
.details { font-size: 12px; color: var(--bc-text-2); margin-top: 4px; }
.joined { font-size: 11px; color: var(--bc-text-3); margin-top: 2px; }
.remove { background: none; border: 0; color: var(--bc-danger); min-height: 44px; min-width: 44px; font-size: 12px; cursor: pointer; }
.invite-actions { display: flex; gap: 12px; margin: 18px 0; }
.invite-actions > * { flex: 1; }
.invite-row { display: flex; align-items: center; gap: 10px; border-bottom: 1px solid var(--bc-border); padding: 8px 0; }
.invite-row:last-child { border-bottom: 0; }
.invite-entry { border: 0; background: none; text-align: left; padding: 4px 0; cursor: pointer; }
.invite-entry strong { display: block; letter-spacing: 2px; font-size: 17px; color: var(--bc-primary-dark); }
.invite-entry span { display: block; color: var(--bc-text-2); font-size: 12px; margin-top: 2px; }
.permissions h3 { font-size: 14px; margin: 0 0 6px; }
.permissions p { font-size: 13px; line-height: 1.8; margin: 0 0 16px; color: var(--bc-text-2); }
.permissions p:last-child { margin-bottom: 0; }
.small { font-size: 12px !important; }
</style>
