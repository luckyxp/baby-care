/* ============================================================================
 *  Service Worker 扩展：系统通知点击处理
 * ----------------------------------------------------------------------------
 *  由 vite-plugin-pwa 的 workbox importScripts 引入，挂在生成的 SW 上。
 *  纯静态阶段只有"页面后台时的系统通知"，点击后回到对应页面；接入后端后
 *  可在此扩展 Web Push（push 事件）的展示逻辑。
 * ========================================================================== */

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const link = (event.notification.data && event.notification.data.link) || ''
  const target = link ? `./#${link.replace(/^\//, '')}` : './'

  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const focused = all.find((c) => 'focus' in c)
      if (focused) {
        await focused.focus()
        focused.postMessage({ type: 'navigate', link })
        return
      }
      await self.clients.openWindow(target)
    })(),
  )
})
