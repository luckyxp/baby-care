/* ============================================================================
 *  消息提醒
 * ----------------------------------------------------------------------------
 *  页面在前台：Vant Notify 顶部横幅（重要消息附带震动）
 *  页面在后台：系统通知（经 Service Worker 展示，点击后回到对应页面）
 *
 *  注：纯静态托管没有推送服务器，App 完全关闭后无法收到提醒；接入后端后
 *  可在 sw-ext.js 中接入 Web Push，展示逻辑复用此处。
 * ========================================================================== */

import { showNotify } from 'vant'
import type { Notice } from '@/shared/types'
import { useUi } from '@/stores/ui'
import type { Router } from 'vue-router'

export const notificationSupported = () => typeof Notification !== 'undefined'

export async function requestAlertPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!notificationSupported()) {
    return 'unsupported'
  }
  return Notification.permission === 'default' ? Notification.requestPermission() : Notification.permission
}

async function systemNotify(n: Notice): Promise<boolean> {
  if (!notificationSupported() || Notification.permission !== 'granted') {
    return false
  }
  const options = { body: n.body, tag: n.id, data: { link: n.link }, icon: './icons/icon-192.png' }
  const reg = await navigator.serviceWorker?.getRegistration()
  if (reg) {
    await reg.showNotification(n.title, options)
  } else {
    new Notification(n.title, options)
  }
  return true
}

export function alertNotices(list: Notice[], router: Router): void {
  if (!useUi().alertOn || !list.length) {
    return
  }
  const latest = [...list].sort((a, b) => b.createdAt - a.createdAt)
  if (document.visibilityState === 'hidden') {
    latest.slice(0, 3).forEach((n) => void systemNotify(n))
    return
  }
  const top = latest.find((n) => n.level === 'important') ?? latest[0]
  const more = list.length > 1 ? `（另有 ${list.length - 1} 条）` : ''
  showNotify({
    type: top.level === 'important' ? 'warning' : 'primary',
    message: `${top.title}\n${top.body}${more}`,
    duration: 3500,
    onClick: () => void router.push(list.length > 1 ? '/notices' : top.link),
  })
  if (top.level === 'important') {
    navigator.vibrate?.(200)
  }
}
