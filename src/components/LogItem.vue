<!-- ==========================================================================
  时间线条目：时间 · 类型图标 · 摘要 · 填写人 · 异常提醒 · 备注数
=========================================================================== -->
<script setup lang="ts">
import { computed } from 'vue'
import { LOG_KINDS } from '@/shared/constants'
import type { CareLog } from '@/shared/types'
import { abnormalReason, isSleeping, summarizeLog } from '@/domain/log-kinds'
import { useClock } from '@/composables/useClock'
import { hm } from '@/utils/time'
import AuthorTag from './AuthorTag.vue'

const props = defineProps<{ log: CareLog; notes?: number; focus?: boolean }>()
defineEmits<{ open: [log: CareLog] }>()

const { now } = useClock()
const meta = computed(() => LOG_KINDS[props.log.type])
const summary = computed(() => summarizeLog(props.log, now.value))
const alert = computed(() => abnormalReason(props.log))
const pending = computed(() => props.log.seq === 0)
</script>

<template>
  <button type="button" class="item" :class="{ 'item--focus': focus }" @click="$emit('open', log)">
    <div class="time">{{ hm(log.time) }}</div>
    <div class="icon" :style="{ background: meta.color + '22' }">{{ meta.icon }}</div>
    <div class="body">
      <div class="summary">
        <span class="kind" :style="{ color: meta.color }">{{ meta.label }}</span>
        <span :class="{ sleeping: isSleeping(log) }">{{ summary }}</span>
      </div>
      <div v-if="log.note" class="note ellipsis">{{ log.note }}</div>
      <div class="meta">
        <AuthorTag :user-id="log.createdBy" />
        <span v-if="log.source === 'voice'" class="pill">🎙 语音</span>
        <span v-if="alert" class="pill pill--danger">⚠️ {{ alert }}</span>
        <span v-if="notes" class="pill pill--primary">💬 {{ notes }}</span>
        <span v-if="pending" class="pill pill--warn" title="尚未同步到云端">待同步</span>
      </div>
    </div>
  </button>
</template>

<style scoped>
.item {
  display: flex;
  align-items: flex-start;
  gap: var(--sp-3);
  width: 100%;
  padding: var(--sp-3) 0;
  border: 0;
  border-bottom: 1px solid var(--bc-border);
  background: none;
  text-align: left;
  cursor: pointer;
}

.item:last-child {
  border-bottom: 0;
}

.item--focus {
  animation: flash 1.6s ease 2;
  border-radius: var(--bc-radius-sm);
}

@keyframes flash {
  50% {
    background: var(--bc-primary-soft);
  }
}

.time {
  width: 40px;
  padding-top: 6px;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: var(--bc-text-2);
}

.icon {
  flex: none;
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 11px;
  font-size: 18px;
}

.body {
  flex: 1;
  min-width: 0;
}

.summary {
  font-size: 15px;
  line-height: 1.5;
}

.kind {
  margin-right: 6px;
  font-weight: 600;
}

.sleeping {
  color: #8e7cf3;
  font-weight: 600;
}

.note {
  font-size: 13px;
  color: var(--bc-text-2);
}

.meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
}
</style>
