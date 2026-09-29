<!-- ==========================================================================
  复制失败兜底：部分内置浏览器禁止脚本写剪贴板，展示全文供长按手动复制
=========================================================================== -->
<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'

defineProps<{ text: string }>()
const show = defineModel<boolean>('show', { required: true })
const area = ref<HTMLTextAreaElement | null>(null)

watch(show, async (on) => {
  if (on) {
    await nextTick()
    area.value?.select()
  }
})
</script>

<template>
  <van-popup v-model:show="show" position="bottom" round closeable teleport="body" :style="{ maxWidth: 'var(--bc-max-w)', left: '50%', transform: 'translateX(-50%)' }">
    <div class="sheet">
      <div class="sheet-head"><div class="sheet-title">手动复制</div></div>
      <p class="muted tip">当前浏览器不允许自动复制，请长按下方文字 → 全选 → 复制。</p>
      <textarea ref="area" class="textarea full" readonly :value="text" />
    </div>
  </van-popup>
</template>

<style scoped>
.tip {
  margin: 0 0 var(--sp-3);
  font-size: 13px;
}

.full {
  min-height: 50vh;
  font-size: 13px;
}
</style>
