/* ============================================================================
 *  网络状态
 * ----------------------------------------------------------------------------
 *  online = 浏览器在线 && 未开启"模拟离线"。
 *  模拟离线用于在电脑上演示"断网记录 → 恢复后自动补传"，开关跨标签页共享。
 * ========================================================================== */

import { reactive } from 'vue'

const SIM_KEY = 'bc.simOffline'
const hasWindow = typeof window !== 'undefined'

export const network = reactive({
  browserOnline: hasWindow ? navigator.onLine : true,
  simulatedOffline: hasWindow ? localStorage.getItem(SIM_KEY) === '1' : false,
})

export const isOnline = (): boolean => network.browserOnline && !network.simulatedOffline

export function setSimulatedOffline(on: boolean): void {
  network.simulatedOffline = on
  localStorage.setItem(SIM_KEY, on ? '1' : '0')
}

if (hasWindow) {
  window.addEventListener('online', () => {
    network.browserOnline = true
  })
  window.addEventListener('offline', () => {
    network.browserOnline = false
  })
  window.addEventListener('storage', (e) => {
    if (e.key === SIM_KEY) {
      network.simulatedOffline = e.newValue === '1'
    }
  })
}
