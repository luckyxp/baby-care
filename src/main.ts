/* ============================================================================
 *  应用入口
 * ----------------------------------------------------------------------------
 *  Vant 组件由 unplugin 按需引入；函数式调用（showToast 等）的样式需手动引入。
 * ========================================================================== */

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import 'vant/es/toast/style'
import 'vant/es/dialog/style'
import 'vant/es/notify/style'
import 'vant/es/image-preview/style'
import './styles/theme.css'
import './styles/base.css'
import App from './App.vue'
import { router } from './router'

createApp(App).use(createPinia()).use(router).mount('#app')
