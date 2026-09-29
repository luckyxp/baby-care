<!-- ==========================================================================
  五边形雷达图（纯 SVG，viewBox 等比缩放）
  ----------------------------------------------------------------------------
  按"完成次数 / 最大次数"归一化，直观看出五大领域活动记录分布（不是能力评分）。
=========================================================================== -->
<script setup lang="ts">
import { computed } from 'vue'

export interface RadarAxis {
  label: string
  value: number
  color: string
}

const props = defineProps<{ axes: RadarAxis[] }>()

const W = 360
const H = 236
const CX = W / 2
const CY = 122
const R = 82
const LEVELS = 4

const point = (i: number, r: number) => {
  const a = -Math.PI / 2 + (i * 2 * Math.PI) / props.axes.length
  return { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) }
}
const poly = (pts: { x: number; y: number }[]) => pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')

const geo = computed(() => {
  const n = props.axes.length
  const max = Math.max(1, ...props.axes.map((a) => a.value))
  const grid = Array.from({ length: LEVELS }, (_, l) => poly(Array.from({ length: n }, (_, i) => point(i, (R * (l + 1)) / LEVELS))))
  const spokes = props.axes.map((_, i) => point(i, R))
  const dots = props.axes.map((a, i) => ({ ...point(i, (R * a.value) / max), color: a.color }))
  const labels = props.axes.map((a, i) => {
    const p = point(i, R + 20)
    const anchor = Math.abs(p.x - CX) < 4 ? 'middle' : p.x > CX ? 'start' : 'end'
    return { ...p, anchor, text: a.label, value: a.value }
  })
  return { grid, spokes, area: poly(dots), dots, labels }
})
</script>

<template>
  <svg class="radar" :viewBox="`0 0 ${W} ${H}`" role="img" :aria-label="axes.map((a) => `${a.label}${a.value}次`).join('，')">
    <polygon v-for="(g, i) in geo.grid" :key="i" class="grid" :points="g" />
    <line v-for="(s, i) in geo.spokes" :key="`s${i}`" class="spoke" :x1="CX" :y1="CY" :x2="s.x" :y2="s.y" />
    <polygon class="area" :points="geo.area" />
    <circle v-for="(d, i) in geo.dots" :key="`d${i}`" :cx="d.x" :cy="d.y" r="4" :style="{ fill: d.color }" class="dot"><title>{{ axes[i].label }}：{{ axes[i].value }}次</title></circle>
    <text v-for="(l, i) in geo.labels" :key="`l${i}`" class="label" :x="l.x" :y="l.y" :text-anchor="l.anchor" dominant-baseline="middle">
      {{ l.text }}<tspan class="num" dx="3">{{ l.value }}</tspan>
    </text>
  </svg>
</template>

<style scoped>
.radar {
  display: block;
  width: 100%;
  max-width: 360px;
  margin: 0 auto;
}

.grid {
  fill: none;
  stroke: var(--bc-border);
}

.spoke {
  stroke: var(--bc-border);
}

.area {
  fill: var(--chart-ink);
  fill-opacity: 0.10;
  stroke: var(--chart-ink);
  stroke-width: 2;
  stroke-linejoin: round;
}

.dot {
  stroke: var(--bc-surface);
  stroke-width: 2;
}

.label {
  font-size: 12px;
  fill: var(--bc-text-2);
}

.num {
  font-weight: 700;
  fill: var(--bc-text);
  font-variant-numeric: tabular-nums;
}
</style>
