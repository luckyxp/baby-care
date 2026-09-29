<!-- ==========================================================================
  选项胶囊组：单选 / 多选，一次点击完成输入（适配单手、碎片化操作）
=========================================================================== -->
<script setup lang="ts" generic="T extends string | number">
export interface ChipOption<V> {
  value: V
  label: string
  icon?: string
  color?: string
  hint?: string
}

const props = withDefaults(defineProps<{ options: ChipOption<T>[]; multiple?: boolean; clearable?: boolean; disabled?: boolean }>(), {
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
  <div class="chips" role="group">
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
      <span v-if="o.icon">{{ o.icon }}</span>
      {{ o.label }}
      <small v-if="o.hint">{{ o.hint }}</small>
    </button>
    <slot />
  </div>
</template>

<style scoped>
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 36px;
  padding: 0 14px;
  border: 1px solid var(--bc-border);
  border-radius: 999px;
  background: var(--bc-surface);
  color: var(--bc-text);
  cursor: pointer;
  transition: all 0.15s ease;
}

.chip small {
  font-size: 11px;
  color: var(--bc-danger);
}

.chip--on {
  border-color: var(--bc-primary);
  background: var(--bc-primary-soft);
  color: var(--bc-primary-dark);
  font-weight: 600;
}

.chip:disabled {
  opacity: 0.6;
  cursor: default;
}

.dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 1px solid rgba(0, 0, 0, 0.1);
}
</style>
