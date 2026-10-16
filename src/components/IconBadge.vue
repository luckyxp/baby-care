<!-- =======================================================================
  功能图标色标：相同功能共用颜色，浅色底只承载图标，正文保持中性。
======================================================================= -->
<script setup lang="ts">
import AppIcon from './AppIcon.vue'

withDefaults(defineProps<{ name: string; tone?: string; size?: 'sm' | 'md' | 'lg' }>(), { size: 'md' })
</script>

<template>
  <span class="icon-badge" :class="`icon-badge--${size}`" :data-tone="tone ?? name" aria-hidden="true">
    <AppIcon :name="name" :size="size === 'sm' ? 16 : size === 'lg' ? 23 : 20" :stroke-width="1.9" />
  </span>
</template>

<style scoped>
.icon-badge {
  display: inline-grid;
  place-items: center;
  flex: none;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  color: var(--bc-blue);
  background: var(--bc-blue-soft);
}
.icon-badge--sm { width: 26px; height: 26px; border-radius: 8px; }
.icon-badge--lg { width: 42px; height: 42px; border-radius: 13px; }
.icon-badge:is([data-tone='feeding'], [data-tone='solid'], [data-tone='gross'], [data-tone='report']) {
  color: var(--bc-milk);
  background: var(--bc-milk-soft);
}
.icon-badge:is([data-tone='edu'], [data-tone='fine'], [data-tone='sleep'], [data-tone='evening'], [data-tone='library']) {
  color: var(--bc-sleep);
  background: var(--bc-sleep-soft);
}
.icon-badge:is([data-tone='social'], [data-tone='bell'], [data-tone='baby'], [data-tone='temp']) {
  color: var(--bc-temp);
  background: var(--bc-temp-soft);
}
.icon-badge:is([data-tone='language'], [data-tone='medicine'], [data-tone='supplement']) {
  color: var(--bc-medicine);
  background: var(--bc-medicine-soft);
}
.icon-badge[data-tone='diaper'] { color: var(--bc-diaper); background: var(--bc-diaper-soft); }
.icon-badge[data-tone='growth'] { color: var(--bc-growth); background: var(--bc-growth-soft); }
.icon-badge[data-tone='other'] { color: var(--bc-text-2); background: var(--bc-surface-2); }
</style>
