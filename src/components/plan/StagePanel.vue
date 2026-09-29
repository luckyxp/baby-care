<!-- ==========================================================================
  本月龄方案：阶段名、发育里程碑、奶量 / 辅食 / 睡眠参考（可折叠）
=========================================================================== -->
<script setup lang="ts">
import { ref } from 'vue'
import type { Stage } from '@/library'

defineProps<{ stage: Stage; ageText: string }>()
const open = ref(false)
</script>

<template>
  <div class="card stage">
    <button type="button" class="head" :aria-expanded="open" @click="open = !open">
      <div class="grow">
        <div class="row">
          <strong class="title">{{ stage.title }}</strong>
          <span class="pill pill--primary">{{ ageText }}</span>
        </div>
        <div class="focus">🎯 {{ stage.focus }}</div>
      </div>
      <span class="toggle">{{ open ? '收起' : '月龄方案' }} <van-icon :name="open ? 'arrow-up' : 'arrow-down'" /></span>
    </button>

    <div v-if="open" class="body">
      <div class="block">
        <div class="block-title">🌱 本阶段里程碑（{{ stage.range }}）</div>
        <ul>
          <li v-for="m in stage.milestones" :key="m">{{ m }}</li>
        </ul>
      </div>
      <div class="block">
        <div class="block-title">🍼 奶量参考</div>
        <p>
          单次 {{ stage.milk.perFeed[0] }}-{{ stage.milk.perFeed[1] }}ml · 每天 {{ stage.milk.times[0] }}-{{ stage.milk.times[1] }} 次 ·
          全天 {{ stage.milk.daily[0] }}-{{ stage.milk.daily[1] }}ml · {{ stage.milk.interval }}
        </p>
        <p class="muted">{{ stage.milk.tip }}</p>
      </div>
      <div class="block">
        <div class="block-title">🥣 辅食</div>
        <p>{{ stage.solid.enabled ? `每天 ${stage.solid.meals} 餐 · ${stage.solid.texture}` : stage.solid.texture }}</p>
        <p class="muted">{{ stage.solid.tip }}</p>
      </div>
      <div class="block">
        <div class="block-title">😴 睡眠</div>
        <p>全天 {{ stage.sleep.total[0] }}-{{ stage.sleep.total[1] }} 小时 · {{ stage.sleep.naps }}</p>
        <p class="muted">{{ stage.sleep.tip }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.stage {
  background: linear-gradient(135deg, var(--bc-primary-soft), var(--bc-surface) 70%);
}

.head {
  display: flex;
  align-items: flex-start;
  gap: var(--sp-3);
  width: 100%;
  padding: 0;
  border: 0;
  background: none;
  text-align: left;
  cursor: pointer;
}

.title {
  font-size: 17px;
}

.focus {
  margin-top: 6px;
  font-size: 13px;
  color: var(--bc-text-2);
}

.toggle {
  flex: none;
  font-size: 12px;
  color: var(--bc-primary);
  white-space: nowrap;
}

.body {
  margin-top: var(--sp-3);
  border-top: 1px dashed var(--bc-border);
  padding-top: var(--sp-2);
}

.block {
  margin-top: var(--sp-3);
}

.block-title {
  font-weight: 600;
  margin-bottom: 4px;
}

.block p {
  margin: 2px 0;
  font-size: 13px;
}

ul {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
}
</style>
