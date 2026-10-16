<!-- =======================================================================
  计划进度：计划页使用四个小圆环，首页保留轻量进度条，共用计数与语义色。
======================================================================= -->
<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  done: number
  total: number
  label: string
  tone?: string
  variant?: 'bar' | 'ring'
}>(), { variant: 'bar' })
const ratio = computed(() => props.total ? Math.max(0, Math.min(100, props.done / props.total * 100)) : 0)
const circumference = 2 * Math.PI * 23
</script>

<template>
  <div class="progress-metric" :class="{ 'progress-metric--ring': variant === 'ring' }" :data-tone="tone">
    <template v-if="variant === 'ring'">
      <div class="ring" role="progressbar" :aria-label="label" :aria-valuenow="done" :aria-valuemin="0" :aria-valuemax="total || 1" :aria-valuetext="`${done} / ${total} 项`">
        <svg viewBox="0 0 54 54" aria-hidden="true">
          <circle class="ring-track" cx="27" cy="27" r="23" />
          <circle v-if="ratio > 0" class="ring-fill" cx="27" cy="27" r="23" :stroke-dasharray="circumference" :stroke-dashoffset="circumference * (1 - ratio / 100)" />
        </svg>
        <span class="ring-value"><strong>{{ done }}</strong><small>/{{ total }}</small></span>
      </div>
      <span class="label">{{ label }}</span>
    </template>
    <template v-else>
      <span class="label">{{ label }}</span>
      <strong class="bar-value">{{ done }}<small> / {{ total }}</small></strong>
      <div class="track" role="progressbar" :aria-label="label" :aria-valuenow="done" :aria-valuemin="0" :aria-valuemax="total || 1"><i :style="{ width: `${ratio}%` }" /></div>
    </template>
  </div>
</template>

<style scoped>
.progress-metric { --progress-color: var(--bc-chart); flex: 1; min-width: 0; }
.progress-metric[data-tone='feeding'] { --progress-color: var(--bc-milk); }
.progress-metric[data-tone='edu'] { --progress-color: var(--bc-sleep); }
.progress-metric[data-tone='day'] { --progress-color: var(--bc-blue); }
.progress-metric[data-tone='evening'] { --progress-color: var(--bc-temp); }
.label { display: block; font-size: 12px; color: var(--bc-text-2); }
.bar-value { display: block; padding: 6px 0 10px; font-size: 22px; line-height: 1.2; font-weight: 500; font-variant-numeric: tabular-nums; }
small { font-size: 12px; font-weight: 400; color: var(--bc-text-3); }
.track { height: 3px; border-radius: 2px; background: var(--bc-surface-2); overflow: hidden; }
i { display: block; height: 100%; border-radius: inherit; background: var(--progress-color); transition: width 200ms ease; }
.progress-metric--ring { display: flex; flex-direction: column; align-items: center; gap: 8px; }
.ring { position: relative; width: 54px; height: 54px; flex: none; }
.ring svg { width: 100%; height: 100%; overflow: visible; transform: rotate(-90deg); }
.ring circle { fill: none; stroke-width: 4; }
.ring-track { stroke: color-mix(in srgb, var(--progress-color) 13%, var(--bc-surface)); }
.ring-fill { stroke: var(--progress-color); stroke-linecap: round; transition: stroke-dashoffset 220ms ease; }
.ring-value { position: absolute; inset: 0; display: flex; align-items: baseline; justify-content: center; gap: 2px; padding-top: 15px; font-variant-numeric: tabular-nums; line-height: 1; }
.ring-value strong { font-size: 19px; font-weight: 600; }
.ring-value small { font-size: 10px; }
</style>
