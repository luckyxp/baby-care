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
import { ageOf, ageText, ago, dayjs } from '@/utils/time'
import ChipGroup from '@/components/ChipGroup.vue'

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
</script>

<template>
  <div class="page page--tab me-page">
    <div class="page-body">
      <div class="page-heading"><h1>我的</h1><span class="pill pill--warn">本机演示版</span></div>
      <button type="button" class="card profile-card" @click="editProfile">
        <span class="profile-avatar">{{ currentAvatar }}</span>
        <span class="grow">
          <span class="profile-name">{{ session.user?.nickname }} <span class="pill pill--primary">{{ role }}</span></span>
          <span class="family-name">{{ session.family?.name }}</span>
        </span>
        <van-icon name="edit" class="muted" size="20" />
      </button>
      <router-link v-if="session.baby" to="/baby" class="card baby-card">
        <span class="baby-avatar" aria-hidden="true">{{ session.baby.avatar || '👶' }}</span>
        <span class="grow"><strong>{{ session.baby.name }}</strong><span class="baby-details">{{ session.baby.gender === 'girl' ? '女宝' : '男宝' }} · {{ babyAge }}</span><small>生日 {{ dayjs(session.baby.birthday).format('YYYY.M.D') }}</small></span>
        <span class="edit-label">{{ session.isAdmin ? '编辑档案' : '查看档案' }} <van-icon name="arrow" /></span>
      </router-link>

      <van-cell-group inset class="menu-group">
        <van-cell title="消息" icon="bell" is-link to="/notices"><template #value><van-badge v-if="unread" :content="unread" /><span v-else>无未读</span></template></van-cell>
        <van-cell title="家庭成员" icon="friends-o" :value="`${session.activeMembers.length} 人`" is-link to="/members" />
        <van-cell title="护理日志" icon="records-o" is-link to="/logs" />
        <van-cell title="素材库" icon="bookmark-o" is-link to="/library" />
        <van-cell title="历史汇报" icon="description-o" is-link to="/report/history" />
      </van-cell-group>

      <div class="section-title">使用偏好</div>
      <section class="card settings">
        <div class="setting-label">外观主题</div>
        <ChipGroup v-model="ui.theme" :options="THEMES" />
        <div class="setting-row"><div class="grow"><strong>消息提醒</strong><p>浏览器通知与页面内提示</p></div><van-switch :model-value="ui.alertOn" size="24" aria-label="消息提醒" @update:model-value="setAlert" /></div>
        <div class="setting-row"><div class="grow"><strong>模拟离线</strong><p>断网也可记录，恢复后自动同步至本浏览器的模拟数据层</p></div><van-switch :model-value="network.simulatedOffline" size="24" aria-label="模拟离线" @update:model-value="setSimulatedOffline" /></div>
      </section>
      <section class="card sync-card">
        <div class="row row--between"><strong>{{ syncLabel }}</strong><van-button size="small" round plain type="primary" :disabled="!isOnline()" :loading="busy || syncState.status === 'syncing'" @click="sync">立即同步</van-button></div>
        <p>上次同步：{{ syncState.lastSyncAt ? ago(syncState.lastSyncAt, now) : '尚未同步' }}</p>
        <p v-if="syncState.error" class="error">{{ syncState.error }}</p>
        <small>此处“同步”只发生在当前浏览器内部，不表示已备份到云端或其他手机。</small>
      </section>

      <div class="section-title">帮助与数据说明</div>
      <section class="card help-card">
        <h3>一家人一起记，先从本机体验</h3>
        <p>在<strong>同一浏览器的同源标签页</strong>登录不同演示账号，可以体验三方共享记录。账号、邀请码与护理数据仅保存在当前浏览器，其他手机、浏览器或无痕窗口不会同步。</p>
        <p>本机角色限制仅用于交互演示，不构成真实身份验证或安全隔离。请勿录入真实敏感信息。清理浏览器存储会删除本机数据。</p>
        <button class="link help-button" type="button" @click="showHelp = true">如何添加到主屏幕？ <van-icon name="arrow" /></button>
      </section>
      <van-button class="logout" block round plain :loading="busy" @click="logout">退出登录</van-button>
      <button v-if="demo" type="button" class="reset" :disabled="busy" @click="reset">重置本机演示数据</button>
      <p class="version">宝宝护理 · 静态 H5 体验版</p>
    </div>

    <van-popup v-model:show="showProfile" position="bottom" round closeable teleport="body" class="me-popup">
      <div class="sheet">
        <div class="sheet-head"><h2 class="sheet-title">个人资料</h2></div>
        <div class="form-label">昵称</div><van-field v-model="nickname" maxlength="12" placeholder="家人怎么称呼你" class="profile-field" />
        <div class="form-label">头像</div>
        <div class="avatars"><button v-for="a in AVATARS" :key="a" type="button" :class="{ selected: a === avatar }" :aria-pressed="a === avatar" :aria-label="`选择头像 ${a}`" @click="avatar = a">{{ a }}</button></div>
        <div class="sheet-actions"><van-button block round type="primary" :loading="busy" @click="saveProfile">保存资料</van-button></div>
      </div>
    </van-popup>
    <van-popup v-model:show="showHelp" position="bottom" round closeable teleport="body" class="me-popup">
      <div class="sheet install-help">
        <h2 class="sheet-title">添加到主屏幕</h2>
        <h3>iPhone / iPad</h3><p>使用 Safari 打开已部署的 HTTPS 站点 → 分享按钮 →「添加到主屏幕」。</p>
        <h3>Android</h3><p>使用 Chrome 打开站点 → 右上角菜单 →「安装应用」或「添加到主屏幕」。</p>
        <p class="muted">首次联网完整打开后，应用外壳可离线使用。系统是否提供安装入口取决于浏览器；安装不会开启跨设备同步或远程消息推送。</p>
      </div>
    </van-popup>
  </div>
</template>

<style scoped>
.me-page { padding-top: max(16px, env(safe-area-inset-top)); }
.page-heading { display: flex; align-items: center; justify-content: space-between; margin: 4px 2px 20px; }
h1 { font-size: 25px; margin: 0; }
.profile-card { display: flex; align-items: center; gap: 14px; width: 100%; border: 0; text-align: left; cursor: pointer; padding: 22px 18px; background: var(--bc-primary-soft); }
.profile-avatar { flex: none; width: 60px; height: 60px; display: grid; place-items: center; font-size: 36px; border-radius: 20px; background: var(--bc-surface); }
.profile-name { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 20px; font-weight: 600; }
.family-name { display: block; margin-top: 6px; color: var(--bc-text-2); font-size: 13px; }
.baby-card { display: flex; align-items: center; gap: 12px; color: inherit; text-decoration: none; }
.baby-avatar { width: 42px; height: 42px; display: grid; place-items: center; font-size: 28px; border-radius: 14px; background: var(--bc-surface-2); }
.baby-card strong { font-size: 16px; }
.baby-details { display: block; font-size: 13px; color: var(--bc-text-2); margin-top: 3px; }
.baby-card small { color: var(--bc-text-3); font-size: 11px; }
.edit-label { flex: none; font-size: 12px; color: var(--bc-primary-dark); }
.menu-group { margin: 16px 0 0; overflow: hidden; box-shadow: var(--bc-shadow); border-radius: var(--bc-radius-lg); }
.menu-group :deep(.van-cell) { padding: 14px 16px; }
.menu-group :deep(.van-cell__left-icon) { color: var(--bc-primary-dark); margin-right: 10px; }
.setting-label { font-weight: 600; margin-bottom: 12px; }
.setting-row { display: flex; gap: 16px; align-items: center; margin-top: 18px; border-top: 1px solid var(--bc-border); padding-top: 16px; }
.setting-row strong { font-size: 14px; font-weight: 500; }
.setting-row p { font-size: 12px; color: var(--bc-text-2); margin: 3px 0 0; }
.setting-row :deep(.van-switch) { flex: none; }
.sync-card p { font-size: 12px; color: var(--bc-text-2); margin: 8px 0; }
.sync-card small { display: block; font-size: 12px; color: var(--bc-text-3); line-height: 1.7; }
.sync-card .error { color: var(--bc-danger); }
.help-card h3 { font-size: 14px; margin: 0 0 8px; }
.help-card p { font-size: 12px; line-height: 1.8; color: var(--bc-text-2); }
.help-button { font-size: 13px; min-height: 44px; }
.logout { margin-top: 22px; }
.reset { display: block; padding: 12px; margin: 12px auto 0; min-height: 44px; border: 0; background: none; color: var(--bc-danger); font-size: 12px; cursor: pointer; }
.version { text-align: center; margin: 20px 0 0; color: var(--bc-text-3); font-size: 11px; letter-spacing: 1px; }
.me-popup { max-width: var(--bc-max-w); left: 50%; transform: translateX(-50%); }
.profile-field { border: 1px solid var(--bc-border); border-radius: 12px; }
.avatars { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; }
.avatars button { height: 46px; border: 1px solid var(--bc-border); border-radius: 12px; background: var(--bc-surface); font-size: 26px; cursor: pointer; }
.avatars .selected { border-color: var(--bc-primary); background: var(--bc-primary-soft); }
.install-help h3 { font-size: 15px; margin-bottom: 6px; }
.install-help p { color: var(--bc-text-2); font-size: 13px; line-height: 1.8; }
</style>
