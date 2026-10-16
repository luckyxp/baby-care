<!-- =======================================================================
  表单弹层骨架：标题和操作固定，内容独立滚动，底部适配安全区与软键盘。
======================================================================= -->
<script setup lang="ts">
defineProps<{ title: string; confirmText?: string; busy?: boolean; disabled?: boolean; tall?: boolean }>()
const show = defineModel<boolean>('show', { required: true })
defineEmits<{ confirm: [] }>()
</script>

<template>
  <van-popup v-model:show="show" position="bottom" round teleport="body" class="app-sheet" :class="{ 'app-sheet--tall': tall }" close-on-popstate>
    <div class="sheet-handle" aria-hidden="true" />
    <header class="app-sheet-head">
      <button v-if="confirmText" type="button" class="sheet-cancel" @click="show = false">取消</button>
      <span v-else aria-hidden="true" />
      <h2>{{ title }}</h2>
      <button v-if="confirmText" type="button" class="sheet-confirm" :disabled="busy || disabled" :aria-busy="busy" @click="$emit('confirm')"><span><van-loading v-if="busy" size="14" color="currentColor" /><template v-else>{{ confirmText }}</template></span></button>
      <button v-else type="button" class="sheet-cancel sheet-done" @click="show = false">完成</button>
    </header>
    <div class="app-sheet-body"><slot /></div>
    <footer v-if="$slots.footer" class="app-sheet-footer"><slot name="footer" /></footer>
  </van-popup>
</template>

<style scoped>
.app-sheet { display: flex; flex-direction: column; width: min(100%, var(--bc-max-w)); max-height: 92dvh; left: 0; right: 0; margin-inline: auto; overflow: hidden; }
.app-sheet--tall { height: 90dvh; }
.sheet-handle { flex: none; width: 32px; height: 4px; border-radius: 4px; margin: 8px auto 0; background: var(--bc-border); }
.app-sheet-head { flex: none; display: grid; grid-template-columns: 64px minmax(0, 1fr) 64px; align-items: center; min-height: 56px; padding: 0 12px; border-bottom: 1px solid var(--bc-border); }
.app-sheet-head h2 { margin: 0; text-align: center; font-size: 16px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sheet-cancel, .sheet-confirm { display: flex; align-items: center; justify-content: center; min-height: 44px; padding: 0; border: 0; background: transparent; font-size: 14px; color: var(--bc-text-2); cursor: pointer; }
.sheet-confirm > span { display: flex; align-items: center; justify-content: center; min-width: 56px; height: 30px; padding: 0 10px; border-radius: 16px; background: var(--bc-primary); color: var(--bc-on-primary); font-weight: 500; font-size: 13px; white-space: nowrap; }
.sheet-confirm:disabled { opacity: .4; }
.sheet-done { color: var(--bc-text); font-weight: 500; }
.app-sheet-body { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 20px 20px calc(24px + env(safe-area-inset-bottom)); scroll-padding: 20px; }
.app-sheet-footer { flex: none; padding: 12px 20px calc(12px + env(safe-area-inset-bottom)); border-top: 1px solid var(--bc-border); }
</style>
