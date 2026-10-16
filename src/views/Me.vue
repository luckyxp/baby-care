<!-- ==========================================================================
  我的：个人与宝宝入口、主题与提醒、本机同步状态、演示帮助
=========================================================================== -->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { showConfirmDialog, showToast } from 'vant'
import { RELATION_AVATAR, RELATION_LABEL } from '@/shared/constants'
import { useSession } from '@/stores/session'
import { useUi, type ThemeMode } from '@/stores/ui'
import { useAction } from '@/composables/useAction'
import { useNotices } from '@/composables/useNotices'
import { useClock } from '@/composables/useClock'
import { requestAlertPermission } from '@/composables/alerts'
import { network, isOnline, setSimulatedOffline } from '@/sync/network'
import { engine, syncState } from '@/sync/engine'
import { isDemoPhone, resetDemo } from '@/cloud/demo'
import { clearCareData } from '@/services/plan'
import { ageOf, ageText, ago } from '@/utils/time'
import ChipGroup from '@/components/ChipGroup.vue'
import AppIcon from '@/components/AppIcon.vue'
import IconBadge from '@/components/IconBadge.vue'
import AppSheet from '@/components/AppSheet.vue'

const session = useSession()
const ui = useUi()
const router = useRouter()
const { unread } = useNotices()
const { busy, run } = useAction()
const { now } = useClock()
const showProfile = ref(false)
const nickname = ref('')
const avatar = ref('')
const showHelp = ref(false)
const AVATARS = ['👩‍🍼', '👨', '👩', '🧑', '👵', '👴', '🐰', '🐻', '🐱', '🌷', '🌻', '🍀']
const THEMES: { value: ThemeMode; label: string }[] = [{ value: 'auto', label: '跟随系统' }, { value: 'light', label: '浅色' }, { value: 'dark', label: '深色' }]

const role = computed(() => session.member ? RELATION_LABEL[session.member.relation] : '尚未加入家庭')
const currentAvatar = computed(() => session.user?.avatar || (session.member ? RELATION_AVATAR[session.member.relation] : '👤'))
const babyAge = computed(() => session.baby ? ageText(ageOf(session.baby.birthday, now.value)) : '')
const demo = computed(() => isDemoPhone(session.user?.phone))
const syncLabel = computed(() => {
  if (!isOnline()) {
    return syncState.pending ? `本地已保存 · ${syncState.pending} 项待同步` : '离线可记录'
  }
  if (syncState.status === 'error') {
    return '本机同步异常'
  }
  return syncState.status === 'syncing' ? '本机同步中' : syncState.pending ? `${syncState.pending} 项待同步` : '本机数据已对齐'
})

function editProfile() {
  nickname.value = session.user?.nickname ?? ''
  avatar.value = currentAvatar.value
  showProfile.value = true
}

async function saveProfile() {
  if (!nickname.value.trim()) {
    showToast('请填写昵称')
    return
  }
  const ok = await run(async () => {
    await session.updateProfile({ nickname: nickname.value.trim(), avatar: avatar.value })
    return true
  }, '个人资料已保存')
  if (ok) {
    showProfile.value = false
  }
}

async function setAlert(on: boolean) {
  ui.alertOn = on
  if (!on) {
    return
  }
  const result = await run(() => requestAlertPermission())
  if (result === 'granted') {
    showToast('已开启浏览器提醒；页面关闭后无远程推送')
  } else if (result === 'denied') {
    showToast('系统通知权限未获允许，仍可查看页面内提醒')
  } else if (result === 'unsupported') {
    showToast('浏览器不支持系统通知，使用页面内提醒')
  }
}

async function sync() {
  const ok = await run(() => engine.syncNow())
  if (ok === true) {
    showToast('本机数据已同步；未上传到远程服务器')
  } else if (ok === false) {
    showToast(syncState.error || '当前无法同步，数据已保存在本机')
  }
}

async function logout() {
  try {
    await showConfirmDialog({
      title: '退出当前账号',
      message: syncState.pending
        ? `还有 ${syncState.pending} 项记录未完成本机同步。退出后不会转移至其他账号，清理浏览器数据可能导致记录丢失，建议先恢复网络同步。仍要退出吗？`
        : '退出后本机记录仍会保留。确定退出吗？',
      confirmButtonText: '退出',
    })
  } catch {
    return
  }
  await run(async () => {
    await session.logout()
    await router.replace('/login')
  })
}

async function reset() {
  try {
    await showConfirmDialog({
      title: '重置演示数据',
      message: '仅删除带演示标记的本机家庭并重建示例。你在这个演示家庭中新增的日志、打卡和未同步内容也会被删除，且无法撤销。其他普通家庭不受影响。确定重置吗？',
      confirmButtonText: '重置演示',
      confirmButtonColor: 'var(--bc-danger)',
    })
  } catch {
    return
  }
  const ok = await run(async () => {
    engine.stop()
    await resetDemo()
    await session.logout(true)
    await router.replace('/login')
    return true
  }, '演示数据已重置')
  if (!ok && session.family && session.token) {
    engine.start(session.token, session.family.id)
  }
}

async function clearData() {
  const baby = session.baby
  if (!baby) {
    return
  }
  try {
    await showConfirmDialog({
      title: '清除护理数据',
      message: '将删除当前宝宝的护理日志、备注、计划、打卡、汇报和日模板。宝宝档案、家庭成员和消息会保留；删除后无法恢复。确定继续吗？',
      confirmButtonText: '清除数据',
      confirmButtonColor: 'var(--bc-danger)',
    })
  } catch {
    return
  }
  await run(() => clearCareData(baby), '护理数据已清除')
}
</script>

<template>
  <div class="page page--tab me-page">
    <div class="page-body">
      <div class="page-heading"><h1>我的</h1><span class="edition">本机演示版</span></div>
      <button type="button" class="card profile-card" @click="editProfile">
        <span class="profile-avatar">{{ currentAvatar }}</span>
        <span class="grow">
          <span class="profile-name">{{ session.user?.nickname }} <span class="role-label">{{ role }}</span></span>
          <span class="family-name">{{ session.family?.name }}</span>
        </span>
        <AppIcon name="right" class="muted" :size="18" />
      </button>
      <router-link v-if="session.baby" to="/baby" class="card baby-card">
        <span class="baby-avatar" aria-hidden="true"><span v-if="session.baby.avatar">{{ session.baby.avatar }}</span><AppIcon v-else name="baby" :size="24" /></span>
        <span class="grow"><strong>{{ session.baby.name }}</strong><span class="baby-details">{{ session.baby.gender === 'girl' ? '女宝' : '男宝' }} · {{ babyAge }}</span></span>
        <span class="edit-label">宝宝档案 <van-icon name="arrow" /></span>
      </router-link>

      <van-cell-group inset class="menu-group">
        <van-cell title="消息" is-link to="/notices"><template #icon><IconBadge name="bell" size="sm" /></template><template #value><span v-if="unread" class="unread-count">{{ unread }}</span><span v-else>无未读</span></template></van-cell>
        <van-cell title="家庭成员" :value="`${session.activeMembers.length} 人`" is-link to="/members"><template #icon><IconBadge name="family" size="sm" /></template></van-cell>
        <van-cell title="护理日志" is-link to="/logs"><template #icon><IconBadge name="report" size="sm" /></template></van-cell>
        <van-cell title="素材库" is-link to="/library"><template #icon><IconBadge name="library" size="sm" /></template></van-cell>
        <van-cell v-if="session.isAdmin" title="日模板库" is-link to="/plan/templates"><template #icon><IconBadge name="template" size="sm" /></template></van-cell>
        <van-cell title="历史汇报" is-link to="/report/history"><template #icon><IconBadge name="book" size="sm" /></template></van-cell>
      </van-cell-group>

      <div class="section-title">使用偏好</div>
      <section class="card settings">
        <div class="setting-label">外观主题</div>
        <ChipGroup v-model="ui.theme" :options="THEMES" segmented />
        <div class="setting-row"><strong class="grow">消息提醒</strong><van-switch :model-value="ui.alertOn" size="22" aria-label="消息提醒" @update:model-value="setAlert" /></div>
        <div class="setting-row"><strong class="grow">模拟离线</strong><van-switch :model-value="network.simulatedOffline" size="22" aria-label="模拟离线" @update:model-value="setSimulatedOffline" /></div>
      </section>
      <section class="card sync-card">
        <div class="row row--between"><strong>{{ syncLabel }}</strong><van-button size="small" round plain type="primary" :disabled="!isOnline()" :loading="busy || syncState.status === 'syncing'" @click="sync">立即同步</van-button></div>
        <p>上次同步：{{ syncState.lastSyncAt ? ago(syncState.lastSyncAt, now) : '尚未同步' }}</p>
        <p v-if="syncState.error" class="error">{{ syncState.error }}</p>
        <small>仅在当前浏览器同步，未备份至云端。</small>
      </section>

      <details class="card help-card">
        <summary>帮助与数据说明 <van-icon name="arrow-down" /></summary>
        <p>在同一浏览器的同源标签页登录不同账号，可体验家庭共享。账号和护理数据保存在本机，其他设备、浏览器或无痕窗口不会同步；清理浏览器存储会删除数据。</p>
        <p>角色权限仅用于交互演示，请勿录入真实敏感信息。</p>
        <button class="link help-button" type="button" @click="showHelp = true">如何添加到主屏幕？ <van-icon name="arrow" /></button>
      </details>
      <div v-if="session.isAdmin" class="section-title">数据管理</div>
      <button v-if="session.isAdmin" type="button" class="card data-card" :disabled="busy" @click="clearData"><span>清除护理数据</span><van-icon name="arrow" /></button>
      <van-button class="logout" block round plain :loading="busy" @click="logout">退出登录</van-button>
      <button v-if="demo" type="button" class="reset" :disabled="busy" @click="reset">重置本机演示数据</button>
      <p class="version">宝宝护理 · 静态 H5 体验版</p>
    </div>

    <AppSheet v-model:show="showProfile" title="个人资料" confirm-text="保存" :busy="busy" :disabled="!nickname.trim()" @confirm="saveProfile">
      <section class="form-section"><label class="form-label" for="profile-nickname">昵称</label><van-field id="profile-nickname" v-model="nickname" maxlength="12" placeholder="家人怎么称呼你" /></section>
      <section class="form-section"><div class="form-label">头像</div><div class="avatars"><button v-for="a in AVATARS" :key="a" type="button" :class="{ selected: a === avatar }" :aria-pressed="a === avatar" :aria-label="`选择头像 ${a}`" @click="avatar = a">{{ a }}</button></div></section>
    </AppSheet>
    <AppSheet v-model:show="showHelp" title="添加到主屏幕">
      <div class="install-help">
        <h3>iPhone / iPad</h3><p>使用 Safari 打开已部署的 HTTPS 站点 → 分享按钮 →「添加到主屏幕」。</p>
        <h3>Android</h3><p>使用 Chrome 打开站点 → 右上角菜单 →「安装应用」或「添加到主屏幕」。</p>
        <p class="muted">首次联网完整打开后，应用外壳可离线使用。系统是否提供安装入口取决于浏览器；安装不会开启跨设备同步或远程消息推送。</p>
      </div>
    </AppSheet>
  </div>
</template>

<style scoped>
.role-label { font-size: 11px; font-weight: 400; color: var(--bc-text-3); padding-left: 8px; border-left: 1px solid var(--bc-border); }
.me-page { padding-top: env(safe-area-inset-top); }
.edition { font-size: 11px; color: var(--bc-text-3); }
.profile-card { display: flex; align-items: center; gap: 12px; width: 100%; text-align: left; cursor: pointer; padding: 18px 16px; }
.profile-avatar { flex: none; width: 52px; height: 52px; display: grid; place-items: center; font-size: 30px; border-radius: 50%; background: var(--bc-surface-2); }
.profile-name { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 18px; font-weight: 600; }
.family-name { display: block; margin-top: 4px; color: var(--bc-text-3); font-size: 12px; }
.baby-card { display: flex; align-items: center; gap: 12px; color: inherit; text-decoration: none; }
.baby-avatar { flex: none; width: 36px; height: 36px; display: grid; place-items: center; font-size: 25px; border-radius: 10px; color: var(--bc-temp); background: var(--bc-temp-soft); }
.baby-card strong { font-size: 14px; font-weight: 500; }
.baby-details { display: block; font-size: 12px; color: var(--bc-text-3); margin-top: 2px; }
.edit-label { flex: none; font-size: 12px; color: var(--bc-text-3); }
.menu-group { margin: 20px 0 0; overflow: hidden; border: 0; border-radius: 14px; }
.menu-group :deep(.van-cell) { min-height: 52px; padding: 14px 16px; }
.menu-group :deep(.van-cell > .icon-badge) { align-self: center; margin-right: 12px; }
.unread-count { display: inline-block; min-width: 20px; padding: 0 6px; border-radius: 5px; background: var(--bc-danger-soft); color: var(--bc-danger); font-size: 12px; text-align: center; }
.setting-label { font-size: 13px; font-weight: 500; margin-bottom: 12px; }
.settings :deep(.chips) { flex-wrap: nowrap; }
.settings :deep(.chip) { flex: 1; justify-content: center; padding: 0 8px; }
.setting-row { display: flex; gap: 16px; align-items: center; min-height: 58px; border-top: 1px solid var(--bc-border); }
.setting-row:first-of-type { margin-top: 16px; }
.setting-row strong { font-size: 14px; font-weight: 400; }
.setting-row :deep(.van-switch) { flex: none; }
.sync-card strong { font-size: 13px; font-weight: 500; }
.sync-card p, .sync-card small { display: block; font-size: 12px; color: var(--bc-text-3); margin: 6px 0 0; }
.sync-card .error { color: var(--bc-danger); }
.help-card summary { display: flex; justify-content: space-between; align-items: center; min-height: 24px; font-size: 14px; cursor: pointer; list-style: none; }
.help-card summary::-webkit-details-marker { display: none; }
.help-card p { font-size: 12px; line-height: 1.8; color: var(--bc-text-2); }
.help-button { font-size: 13px; }
.data-card { display: flex; justify-content: space-between; align-items: center; width: 100%; color: var(--bc-danger); text-align: left; cursor: pointer; min-height: 52px; }
.logout { margin-top: 20px; }
.reset { display: block; padding: 12px; margin: 8px auto 0; min-height: 44px; border: 0; background: transparent; color: var(--bc-text-3); font-size: 12px; cursor: pointer; }
.version { text-align: center; margin: 16px 0 0; color: var(--bc-text-3); font-size: 11px; }
.avatars { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; }
.avatars button { height: 46px; border: 1px solid var(--bc-border); border-radius: 8px; background: var(--bc-surface); font-size: 26px; cursor: pointer; }
.avatars .selected { border-color: var(--bc-text-2); background: var(--bc-surface-2); }
.install-help h3 { font-size: 15px; margin-bottom: 6px; }
.install-help p { color: var(--bc-text-2); font-size: 13px; line-height: 1.8; }
</style>
