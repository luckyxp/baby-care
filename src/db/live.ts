/* ============================================================================
 *  useLive · 响应式本地查询
 * ----------------------------------------------------------------------------
 *  Dexie liveQuery 会追踪查询读过的表与索引范围，任何写入（本地操作 / 同步
 *  落库）命中时自动重跑。deps 用于声明查询依赖的 Vue 响应式参数（如日期）。
 * ========================================================================== */

import { liveQuery } from 'dexie'
import { onScopeDispose, shallowRef, watch, type ShallowRef, type WatchSource } from 'vue'
import { dbEpoch, hasDB } from './client'

export function useLive<T>(
  query: () => Promise<T>,
  initial: T,
  deps: WatchSource[] = [],
): Readonly<ShallowRef<T>> {
  const state = shallowRef(initial) as ShallowRef<T>
  let sub: { unsubscribe(): void } | null = null

  const subscribe = () => {
    sub?.unsubscribe()
    sub = null
    if (!hasDB()) {
      state.value = initial
      return
    }
    sub = liveQuery(query).subscribe({
      next: (v) => {
        state.value = v
      },
      error: (e) => console.error('[useLive]', e),
    })
  }

  watch([dbEpoch, ...deps], subscribe, { immediate: true })
  onScopeDispose(() => sub?.unsubscribe())
  return state
}
