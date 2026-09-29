<!-- ==========================================================================
  进度环：完成数 / 计划数，中心显示分数，下方标签
=========================================================================== -->
<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{ done: number; total: number; label: string; color?: string; icon?: string }>(), {
  color: 'var(--bc-primary)',
  icon: '',
})

const R = 22
const C = 2 * Math.PI * R
const ratio = computed(() => (props.total ? Math.min(1, props.done / props.total) : 0))
</script>

<template>
  <div class="ring" :aria-label="`${label} ${done}/${total}`">
    <svg viewBox="0 0 56 56" width="56" height="56">
      <circle cx="28" cy="28" :r="R" class="track" />
      <circle
        cx="28" cy="28" :r="R" class="bar" :stroke="color"
        :stroke-dasharray="C" :stroke-dashoffset="C * (1 - ratio)" transform="rotate(-90 28 28)"
      />
      <text x="28" y="32" text-anchor="middle" class="num">{{ ratio === 1 ? '✓' : `${done}/${total}` }}</text>
    </svg>
    <div class="label">{{ icon }} {{ label }}</div>
  </div>
</template>

<style scoped>
.ring {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.track {
  fill: none;
  stroke: var(--bc-surface-2);
  stroke-width: 5;
}

.bar {
  fill: none;
  stroke-width: 5;
  stroke-linecap: round;
  transition: stroke-dashoffset 0.4s ease;
}

.num {
  font-size: 12px;
  font-weight: 700;
  fill: var(--bc-text);
}

.label {
  font-size: 12px;
  color: var(--bc-text-2);
  white-space: nowrap;
}
</style>
