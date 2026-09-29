<!-- ==========================================================================
  二级页面导航栏：标题默认取路由 meta.title；返回时无历史则回首页
=========================================================================== -->
<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'

defineProps<{ title?: string }>()
const route = useRoute()
const router = useRouter()

function back() {
  if (window.history.state?.back) {
    router.back()
  } else {
    void router.replace('/home')
  }
}
</script>

<template>
  <van-nav-bar :title="title ?? route.meta.title" left-arrow fixed placeholder safe-area-inset-top class="page-nav" @click-left="back">
    <template #right><slot name="right" /></template>
  </van-nav-bar>
</template>

<style scoped>
.page-nav :deep(.van-nav-bar--fixed) {
  left: 50%;
  transform: translateX(-50%);
  max-width: var(--bc-max-w);
}
</style>
