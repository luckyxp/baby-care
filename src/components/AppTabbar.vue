<!-- ==========================================================================
  底部导航：今天 / 计划 / 汇报 / 看板 / 我的
=========================================================================== -->
<script setup lang="ts">
import { useNotices } from '@/composables/useNotices'

const { unread } = useNotices()
</script>

<template>
  <van-tabbar route fixed placeholder safe-area-inset-bottom class="app-tabbar">
    <van-tabbar-item to="/home" icon="home-o">今天</van-tabbar-item>
    <van-tabbar-item to="/plan" icon="todo-list-o">计划</van-tabbar-item>
    <van-tabbar-item to="/report" icon="description-o">汇报</van-tabbar-item>
    <van-tabbar-item to="/stats" icon="chart-trending-o">看板</van-tabbar-item>
    <van-tabbar-item to="/me" icon="user-o" :badge="unread || undefined">我的</van-tabbar-item>
  </van-tabbar>
</template>

<style scoped>
.app-tabbar :deep(.van-tabbar) {
  left: 50%;
  transform: translateX(-50%);
  max-width: var(--bc-max-w);
  box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.04);
}
</style>
