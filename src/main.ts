/* ============================================================================
 *  应用入口
 * ----------------------------------------------------------------------------
 *  Vant 组件由 unplugin 按需引入；函数式调用（showToast 等）的样式需手动引入。
 * ========================================================================== */

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { registerSW } from 'virtual:pwa-register'
import 'vant/es/toast/style'
import 'vant/es/dialog/style'
import 'vant/es/notify/style'
import 'vant/es/image-preview/style'
import './styles/theme.css'
import './styles/base.css'
import App from './App.vue'
import { router } from './router'

createApp(App).use(createPinia()).use(router).mount('#app')

/* ----------------------------------------------------------------------------
 * 应用更新：新版缓存就绪后重新加载页面；返回前台或恢复联网时主动检查。
 * 只更新应用资源，护理记录仍由原有的本地数据库保存。
 * -------------------------------------------------------------------------- */
registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (!registration) return

    let checking = false
    const checkForUpdate = async () => {
      if (checking || document.visibilityState !== 'visible' || !navigator.onLine || registration.installing) return

      checking = true
      try {
        await registration.update()
      } catch (error) {
        console.warn('应用更新检查失败', error)
      } finally {
        checking = false
      }
    }

    document.addEventListener('visibilitychange', checkForUpdate)
    window.addEventListener('online', checkForUpdate)
    void checkForUpdate()
  },
  onRegisterError(error) {
    console.warn('应用离线缓存注册失败', error)
  },
})
