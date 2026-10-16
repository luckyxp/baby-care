<!-- =======================================================================
  行内操作菜单：靠近触发位置展开；每项保留 44px 点击区域，关闭后交还焦点。
======================================================================= -->
<script setup lang="ts">
import { ref } from 'vue'
import AppIcon from './AppIcon.vue'

export interface MenuAction { text: string; value: string; icon?: string; danger?: boolean; disabled?: boolean }
defineProps<{ label: string; actions: MenuAction[]; disabled?: boolean; text?: string }>()
const emit = defineEmits<{ select: [action: MenuAction] }>()
const show = ref(false)
const trigger = ref<HTMLButtonElement>()
function select(action: MenuAction) {
  show.value = false
  trigger.value?.focus({ preventScroll: true })
  emit('select', action)
}
</script>

<template>
  <van-popover v-model:show="show" placement="bottom-end" teleport="body" :offset="[0, 4]" class="action-menu">
    <div class="menu-items" role="group" :aria-label="label" @keydown.esc="show = false; trigger?.focus()">
      <button v-for="action in actions" :key="action.value" type="button" class="menu-item" :class="{ 'menu-item--danger': action.danger }" :disabled="action.disabled" @click="select(action)">
        <AppIcon v-if="action.icon" :name="action.icon" :size="17" />{{ action.text }}
      </button>
    </div>
    <template #reference>
      <button ref="trigger" type="button" :class="text ? 'menu-trigger' : 'icon-button'" :disabled="disabled" :aria-label="label" :aria-expanded="show" aria-haspopup="true" @keydown.esc="show = false"><template v-if="text">{{ text }}<AppIcon name="down" :size="13" /></template><AppIcon v-else name="more" :size="21" /></button>
    </template>
  </van-popover>
</template>

<style scoped>
.menu-trigger { display: inline-flex; align-items: center; gap: 4px; min-height: 44px; padding: 0; border: 0; color: var(--bc-text-2); background: transparent; font-size: 13px; cursor: pointer; }
.menu-items { width: 164px; padding: 5px; }
.menu-item { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 44px; padding: 0 12px; border: 0; border-radius: 7px; background: transparent; text-align: left; font-size: 14px; cursor: pointer; }
.menu-item:active, .menu-item:hover { background: var(--bc-surface-2); }
.menu-item--danger { color: var(--bc-danger); }
.menu-item:disabled { opacity: .35; }
</style>
