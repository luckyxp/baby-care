<!-- ==========================================================================
  同步状态胶囊：已同步 / 同步中 / 离线（N 条待上传） / 同步异常；点击立即同步
=========================================================================== -->
<script setup lang="ts">
import { computed } from 'vue'
import { showToast } from 'vant'
import { network } from '@/sync/network'
import { engine, syncState } from '@/sync/engine'

const view = computed(() => {
  if (network.simulatedOffline || !network.browserOnline || syncState.status === 'offline') {
    return { cls: 'pill--warn', icon: '📴', text: syncState.pending ? `离线 · ${syncState.pending}条待上传` : '离线可记录' }
  }
  if (syncState.status === 'error') {
    return { cls: 'pill--danger', icon: '⚠️', text: '同步异常' }
  }
  if (syncState.status === 'syncing' || syncState.pending) {
    return { cls: 'pill--primary', icon: '🔄', text: '同步中' }
  }
  return { cls: 'pill--accent', icon: '✓', text: '已同步' }
})

async function syncNow() {
  if (syncState.status === 'error') {
    showToast(syncState.error || '同步失败，稍后自动重试')
  }
  await engine.syncNow()
}
</script>

<template>
  <button class="pill sync" :class="view.cls" type="button" @click="syncNow">
    <span>{{ view.icon }}</span>{{ view.text }}
  </button>
</template>

<style scoped>
.sync {
  border: 0;
  cursor: pointer;
}
</style>
