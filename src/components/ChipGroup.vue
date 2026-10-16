<!-- ==========================================================================
  选项胶囊组：单选 / 多选，一次点击完成输入（适配单手、碎片化操作）
=========================================================================== -->
<script setup lang="ts" generic="T extends string | number">
import AppIcon from './AppIcon.vue'

export interface ChipOption<V> {
  value: V
  label: string
  icon?: string
  symbol?: string
  color?: string
  hint?: string
}

const props = withDefaults(defineProps<{ options: ChipOption<T>[]; multiple?: boolean; clearable?: boolean; disabled?: boolean; scroll?: boolean; segmented?: boolean }>(), {
  multiple: false,
  clearable: false,
  disabled: false,
})
const model = defineModel<T | T[] | null>({ required: true })

const active = (v: T) => (Array.isArray(model.value) ? model.value.includes(v) : model.value === v)

function toggle(v: T) {
  if (props.disabled) {
    return
  }
  if (props.multiple) {
    const list = Array.isArray(model.value) ? model.value : []
    model.value = list.includes(v) ? list.filter((x) => x !== v) : [...list, v]
    return
  }
  model.value = model.value === v && props.clearable ? null : v
}
</script>

<template>
  <div class="chips" :class="{ 'chips--scroll': scroll, 'chips--segmented': segmented }" role="group">
    <button
      v-for="o in options"
      :key="String(o.value)"
      type="button"
      class="chip"
      :class="{ 'chip--on': active(o.value) }"
      :disabled="disabled"
      :aria-pressed="active(o.value)"
      @click="toggle(o.value)"
    >
      <span v-if="o.color" class="dot" :style="{ background: o.color }" />
      <AppIcon v-if="o.symbol" :name="o.symbol" :size="17" />
      <span v-else-if="o.icon">{{ o.icon }}</span>
      <span>{{ o.label }}</span>
      <small v-if="o.hint">{{ o.hint }}</small>
    </button>
    <slot />
  </div>
</template>

<style scoped>
.chips { display: flex; flex-wrap: wrap; gap: 0 8px; }
.chip { position: relative; isolation: isolate; display: inline-flex; align-items: center; justify-content: center; gap: 5px; min-width: 44px; min-height: 44px; padding: 0 13px; border: 0; background: transparent; color: var(--bc-text-2); cursor: pointer; font-size: 13px; white-space: nowrap; }
.chip::before { content: ''; position: absolute; z-index: -1; inset: 5px 0; border: 1px solid transparent; border-radius: 7px; background: var(--bc-surface-2); transition: background 160ms ease, border-color 160ms ease; }
.chip--on { color: var(--bc-text); font-weight: 600; }
.chip--on::before { border-color: var(--bc-text-3); }
.chip:disabled { opacity: .4; }
.chip small { font-size: 10px; color: var(--bc-danger); }
.dot { width: 10px; height: 10px; border-radius: 50%; }
.chips--scroll { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; margin-inline: -20px; padding-inline: 20px; }
.chips--scroll::-webkit-scrollbar { display: none; }
.chips--scroll .chip { flex: none; }
.chips--segmented { flex-wrap: nowrap; gap: 4px; padding: 0 4px; border-radius: 10px; background: var(--bc-surface-2); }
.chips--segmented .chip { flex: 1; padding-inline: 8px; }
.chips--segmented .chip::before { background: transparent; }
.chips--segmented .chip--on::before { background: var(--bc-surface); border-color: transparent; box-shadow: var(--bc-shadow); }
</style>
