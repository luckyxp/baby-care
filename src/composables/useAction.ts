/* ============================================================================
 *  useAction · 统一的操作反馈：执行中防重、成功轻提示、失败给出可读原因
 * ========================================================================== */

import { ref } from 'vue'
import { showFailToast, showSuccessToast } from 'vant'
import { errorMessage } from '@/shared/errors'

export function useAction() {
  const busy = ref(false)

  async function run<T>(fn: () => Promise<T>, success?: string): Promise<T | undefined> {
    if (busy.value) {
      return undefined
    }
    busy.value = true
    try {
      const out = await fn()
      if (success) {
        showSuccessToast({ message: success, duration: 1200 })
      }
      return out
    } catch (e) {
      showFailToast({ message: errorMessage(e), duration: 2200 })
      return undefined
    } finally {
      busy.value = false
    }
  }

  return { busy, run }
}
