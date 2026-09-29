/* ============================================================================
 *  全局时钟：now 每 30 秒跳动一次（"距上次喂奶"等相对时间），today 跨零点自动切换
 * ========================================================================== */

import { computed, ref } from 'vue'
import { dateKey } from '@/utils/time'

const now = ref(Date.now())
const tick = () => {
  now.value = Date.now()
}

setInterval(tick, 30_000)
document.addEventListener('visibilitychange', tick)

const today = computed(() => dateKey(now.value))

export function useClock() {
  return { now, today }
}
