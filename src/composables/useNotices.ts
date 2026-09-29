/* ============================================================================
 *  useNotices · 我的消息（本地库实时查询，云端只下发给接收人本人）
 * ========================================================================== */

import { computed } from 'vue'
import type { Notice } from '@/shared/types'
import { db } from '@/db/client'
import { useLive } from '@/db/live'
import { update } from '@/db/repo'

export function useNotices() {
  const list = useLive(
    async () => (await db().notices.orderBy('createdAt').reverse().toArray()).filter((n) => !n.deleted),
    [] as Notice[],
  )
  const unread = computed(() => list.value.filter((n) => !n.readAt).length)

  const markRead = (n: Notice) => (n.readAt ? Promise.resolve() : update('notices', { id: n.id, readAt: Date.now() }).then(() => {}))
  const markAll = async () => {
    for (const n of list.value.filter((x) => !x.readAt)) {
      await update('notices', { id: n.id, readAt: Date.now() })
    }
  }

  return { list, unread, markRead, markAll }
}
