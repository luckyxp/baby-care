<!-- ==========================================================================
  根组件：主题、底部导航、同步引擎回调（消息提醒 / 被拒回滚 / 被移出家庭）
=========================================================================== -->
<script setup lang="ts">
import { watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showDialog, showNotify } from 'vant'
import AppTabbar from '@/components/AppTabbar.vue'
import { alertNotices } from '@/composables/alerts'
import { engine } from '@/sync/engine'
import { useSession } from '@/stores/session'
import { useUi } from '@/stores/ui'

const session = useSession()
const ui = useUi()
const route = useRoute()
const router = useRouter()

engine.hooks = {
  onRejected: (list) =>
    showNotify({
      type: 'warning',
      message: `${list.length} 项修改未被云端接受，已恢复原内容：${list[0].result.message ?? ''}`,
      duration: 4000,
    }),
  onNotices: (list) => alertNotices(list, router),
  onKicked: (e) => void session.onKicked(e.message),
}

watch(
  () => session.kickedReason,
  async (reason) => {
    if (!reason) {
      return
    }
    session.kickedReason = ''
    await showDialog({ title: '提示', message: reason })
    await router.replace(!session.user ? '/login' : session.family ? '/home' : '/onboard')
  },
)

// 系统通知被点击时，Service Worker 通知页面跳转到对应位置
navigator.serviceWorker?.addEventListener('message', (e: MessageEvent<{ type: string; link: string }>) => {
  if (e.data?.type === 'navigate' && e.data.link) {
    void router.push(e.data.link)
  }
})
</script>

<template>
  <van-config-provider :theme="ui.dark ? 'dark' : 'light'" theme-vars-scope="global">
    <router-view />
    <AppTabbar v-if="route.meta.tab && session.family" />
  </van-config-provider>
</template>
