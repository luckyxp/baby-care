<!-- ==========================================================================
  底部导航：今天 / 计划 / 汇报 / 看板 / 我的
=========================================================================== -->
<script setup lang="ts">
import AppIcon from './AppIcon.vue'
import { useNotices } from '@/composables/useNotices'

const { unread } = useNotices()
</script>

<template>
  <van-tabbar route fixed placeholder safe-area-inset-bottom class="app-tabbar">
    <van-tabbar-item to="/home"><template #icon="{ active }"><span class="nav-icon" :class="{ 'nav-icon--active': active }"><AppIcon name="home" :stroke-width="active ? 2.1 : 1.7" /></span></template>今天</van-tabbar-item>
    <van-tabbar-item to="/plan"><template #icon="{ active }"><span class="nav-icon" :class="{ 'nav-icon--active': active }"><AppIcon name="plan" :stroke-width="active ? 2.1 : 1.7" /></span></template>计划</van-tabbar-item>
    <van-tabbar-item to="/report"><template #icon="{ active }"><span class="nav-icon" :class="{ 'nav-icon--active': active }"><AppIcon name="report" :stroke-width="active ? 2.1 : 1.7" /></span></template>汇报</van-tabbar-item>
    <van-tabbar-item to="/stats"><template #icon="{ active }"><span class="nav-icon" :class="{ 'nav-icon--active': active }"><AppIcon name="stats" :stroke-width="active ? 2.1 : 1.7" /></span></template>看板</van-tabbar-item>
    <van-tabbar-item to="/me" :badge="unread || undefined"><template #icon="{ active }"><span class="nav-icon" :class="{ 'nav-icon--active': active }"><AppIcon name="user" :stroke-width="active ? 2.1 : 1.7" /></span></template>我的</van-tabbar-item>
  </van-tabbar>
</template>

<style scoped>
.app-tabbar :deep(.van-tabbar) {
  left: 50%;
  transform: translateX(-50%);
  max-width: var(--bc-max-w);
  border-top: 1px solid var(--bc-border);
  padding-top: 2px;
}
.app-tabbar :deep(.van-tabbar-item__icon) { margin-bottom: 3px; }
.app-tabbar :deep(.van-tabbar-item--active) { font-weight: 600; }
.nav-icon { display: grid; place-items: center; width: 32px; height: 28px; border-radius: 9px; }
.nav-icon--active { color: var(--bc-primary); background: var(--bc-primary-soft); }
</style>
