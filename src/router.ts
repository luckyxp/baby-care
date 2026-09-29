/* ============================================================================
 *  路由
 * ----------------------------------------------------------------------------
 *  Hash 模式：纯静态托管无需服务端回退配置。
 *
 *    meta.public  无需登录        meta.tab    显示底部导航
 *    meta.admin   仅育儿嫂可进入   meta.title  导航栏标题
 * ========================================================================== */

import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'
import { useSession } from '@/stores/session'

declare module 'vue-router' {
  interface RouteMeta {
    public?: boolean
    tab?: boolean
    admin?: boolean
    title?: string
  }
}

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/home' },
  { path: '/login', component: () => import('@/views/auth/Login.vue'), meta: { public: true } },
  { path: '/onboard', component: () => import('@/views/auth/Onboard.vue') },
  { path: '/join', redirect: (to) => ({ path: '/onboard', query: to.query }) },

  { path: '/home', component: () => import('@/views/Home.vue'), meta: { tab: true } },
  { path: '/logs', component: () => import('@/views/Logs.vue'), meta: { title: '护理日志' } },
  { path: '/plan', component: () => import('@/views/Plan.vue'), meta: { tab: true } },
  { path: '/library', component: () => import('@/views/Library.vue'), meta: { title: '素材库' } },
  { path: '/report', component: () => import('@/views/Report.vue'), meta: { tab: true } },
  { path: '/report/history', component: () => import('@/views/ReportHistory.vue'), meta: { title: '历史汇报' } },
  { path: '/stats', component: () => import('@/views/Stats.vue'), meta: { tab: true } },
  { path: '/me', component: () => import('@/views/Me.vue'), meta: { tab: true } },
  { path: '/members', component: () => import('@/views/Members.vue'), meta: { title: '家庭成员' } },
  { path: '/baby', component: () => import('@/views/BabyEdit.vue'), meta: { title: '宝宝档案' } },
  { path: '/notices', component: () => import('@/views/Notices.vue'), meta: { title: '消息' } },
  { path: '/:pathMatch(.*)*', redirect: '/home' },
]

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior: (_to, _from, saved) => saved ?? { top: 0 },
})

router.beforeEach(async (to) => {
  const session = useSession()
  await session.bootstrap()
  if (to.meta.public) {
    return session.user && to.path === '/login' ? '/home' : true
  }
  if (!session.user) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }
  if (!session.family) {
    return to.path === '/onboard' ? true : { path: '/onboard', query: to.query.code ? { code: to.query.code } : {} }
  }
  if (to.path === '/onboard') {
    return '/home'
  }
  if (to.meta.admin && !session.isAdmin) {
    return '/home'
  }
  return true
})
