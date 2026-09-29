<!-- ==========================================================================
  柱状图（纯 SVG，随容器宽度自适应）
  ----------------------------------------------------------------------------
  · 柱顶数值：柱子少（≤10）时全部显示，否则只标注最高值与高亮柱
  · 高亮柱：通常是"今天"
  · 参考带：如月龄方案的全天奶量参考区间，以浅色横带绘制
=========================================================================== -->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

export interface BarItem {
  key: string
  label: string
  value: number
  highlight?: boolean
}

const props = withDefaults(
  defineProps<{
    items: BarItem[]
    color?: string
    band?: [number, number] | null
    format?: (v: number) => string
    height?: number
  }>(),
  { color: 'var(--bc-primary)', band: null, format: (v: number) => String(Math.round(v)), height: 168 },
)

/* ── 尺寸 ───────────────────────────────────────────────────────────────── */

const box = ref<HTMLElement | null>(null)
const width = ref(320)
let ro: ResizeObserver | null = null

onMounted(() => {
  if (!box.value) {
    return
  }
  width.value = box.value.clientWidth || 320
  ro = new ResizeObserver(([e]) => {
    width.value = Math.max(160, Math.round(e.contentRect.width))
  })
  ro.observe(box.value)
})
onBeforeUnmount(() => ro?.disconnect())

const PAD = { top: 20, bottom: 22, x: 20 }
const selected = ref<BarItem | null>(null)

/* ── 几何 ───────────────────────────────────────────────────────────────── */

const geo = computed(() => {
  const n = Math.max(1, props.items.length)
  const inner = width.value - PAD.x * 2
  const plotH = props.height - PAD.top - PAD.bottom
  const values = props.items.map((i) => i.value)
  const peak = Math.max(1, ...values, props.band?.[1] ?? 0) * 1.08
  const slot = inner / n
  const barW = Math.max(3, Math.min(24, slot * 0.62))
  const y = (v: number) => PAD.top + plotH - (v / peak) * plotH
  const max = Math.max(...values)
  const maxIndex = values.indexOf(max)
  const labelEvery = Math.ceil(n / 8)

  const bars = props.items.map((it, i) => {
    const cx = PAD.x + slot * i + slot / 2
    const top = y(it.value)
    const showValue = it.value > 0 && (n <= 10 || it.highlight || i === maxIndex)
    const showLabel = n <= 10 || i % labelEvery === 0 || it.highlight
    return { ...it, x: cx - barW / 2, cx, top, h: Math.max(it.value > 0 ? 2 : 0, PAD.top + plotH - top), showValue, showLabel }
  })

  const band = props.band ? { y: y(props.band[1]), h: y(props.band[0]) - y(props.band[1]) } : null
  return { bars, band, barW, slot, baseY: PAD.top + plotH, topLabel: props.format(peak) }
})
</script>

<template>
  <div ref="box" class="bar-chart">
    <svg :width="width" :height="height" role="img" :aria-label="items.map((i) => `${i.label} ${format(i.value)}`).join('，')">
      <rect v-if="geo.band" class="band" :x="0" :y="geo.band.y" :width="width" :height="geo.band.h" rx="4" />
      <line class="axis" :x1="0" :x2="width" :y1="geo.baseY" :y2="geo.baseY" />
      <g v-for="b in geo.bars" :key="b.key" tabindex="0" role="button" :aria-label="`${b.label}：${format(b.value)}`" @mouseenter="selected = b" @focus="selected = b" @click="selected = b" @keydown.enter="selected = b">
        <title>{{ b.label }}：{{ format(b.value) }}</title>
        <rect
          :x="b.x"
          :y="b.top"
          :width="geo.barW"
          :height="b.h"
          :rx="Math.min(4, geo.barW / 2)"
          :style="{ fill: color, opacity: b.highlight ? 1 : 0.85 }"
        />
        <rect :x="b.x" :y="geo.baseY - Math.min(4, b.h)" :width="geo.barW" :height="Math.min(4, b.h)" :style="{ fill: color, opacity: b.highlight ? 1 : 0.85 }" />
        <rect :x="b.cx - geo.slot / 2" :y="0" :width="geo.slot" :height="height" fill="transparent" />
        <text v-if="b.showValue" class="value" :class="{ strong: b.highlight }" :x="b.cx" :y="b.top - 5" text-anchor="middle">{{ format(b.value) }}</text>
        <text v-if="b.showLabel" class="label" :class="{ strong: b.highlight }" :x="b.cx" :y="height - 6" text-anchor="middle">{{ b.label }}</text>
      </g>
    </svg>
    <div class="tooltip" role="status">{{ selected ? `${selected.label}：${format(selected.value)}` : '点选柱形查看数值 · 零值表示无对应记录' }}</div>
  </div>
</template>

<style scoped>
.bar-chart {
  width: 100%;
  overflow: hidden;
}

.tooltip { min-height: 22px; font-size: 12px; text-align: center; color: var(--bc-text-2); }
g:focus-visible { outline: 1px solid var(--bc-text); }

svg {
  display: block;
}

.band {
  fill: var(--bc-accent);
  opacity: 0.12;
}

.axis {
  stroke: var(--bc-border);
  stroke-width: 1;
}

.value,
.label {
  font-size: 10px;
  fill: var(--bc-text-3);
  font-variant-numeric: tabular-nums;
}

.value {
  fill: var(--bc-text-2);
}

.strong {
  fill: var(--bc-text);
  font-weight: 600;
}
</style>
