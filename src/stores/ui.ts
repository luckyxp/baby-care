/* ============================================================================
 *  界面偏好 Store：主题（跟随系统 / 浅色 / 深色）、消息提醒开关
 * ========================================================================== */

import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

export type ThemeMode = 'auto' | 'light' | 'dark'

const THEME_KEY = 'bc.theme'
const ALERT_KEY = 'bc.alert'

export const useUi = defineStore('ui', () => {
  const theme = ref<ThemeMode>((localStorage.getItem(THEME_KEY) as ThemeMode) || 'auto')
  const alertOn = ref(localStorage.getItem(ALERT_KEY) !== '0')

  const media = window.matchMedia('(prefers-color-scheme: dark)')
  const systemDark = ref(media.matches)
  media.addEventListener('change', (e) => {
    systemDark.value = e.matches
  })

  const dark = computed(() => (theme.value === 'auto' ? systemDark.value : theme.value === 'dark'))

  watch(theme, (v) => localStorage.setItem(THEME_KEY, v))
  watch(alertOn, (v) => localStorage.setItem(ALERT_KEY, v ? '1' : '0'))
  watch(
    dark,
    (v) => document.querySelector('meta[name="theme-color"]')?.setAttribute('content', v ? '#151211' : '#FFF8F4'),
    { immediate: true },
  )

  return { theme, alertOn, dark }
})
