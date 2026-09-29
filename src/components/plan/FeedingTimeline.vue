<!-- ==========================================================================
  喂养时间轴：按计划时点排列；记录日志即自动完成（无需单独打卡）
=========================================================================== -->
<script setup lang="ts">
import { FEED_KIND_META } from '@/shared/constants'
import type { CareLog, FeedKind, PlanTask } from '@/shared/types'
import { summarizeLog } from '@/domain/log-kinds'
import { hm } from '@/utils/time'
import AuthorTag from '@/components/AuthorTag.vue'

defineProps<{
  tasks: PlanTask[]
  matched: Map<string, CareLog>
  editing: boolean
  canRecord: boolean
  locked: boolean
}>()

defineEmits<{
  record: [task: PlanTask]
  open: [log: CareLog]
  edit: [task: PlanTask]
  remove: [task: PlanTask]
}>()

const planned = (t: PlanTask) => (t.amount ? `${t.amount}ml` : '')
</script>

<template>
  <div class="card timeline">
    <div
      v-for="t in tasks" :id="`task-${t.id}`" :key="t.id" class="slot"
      :class="{ 'slot--done': matched.has(t.id), 'slot--evening': t.slot === 'evening' }"
    >
      <div class="time">{{ t.time ?? '--:--' }}</div>
      <div class="dot">{{ FEED_KIND_META[t.category as FeedKind]?.icon ?? '🍼' }}</div>
      <div class="grow body">
        <div class="row row--between">
          <div class="title ellipsis">
            {{ t.title }} <span v-if="planned(t)" class="muted">计划 {{ planned(t) }}</span>
          </div>
          <template v-if="editing">
            <span class="row">
              <button type="button" class="link" @click="$emit('edit', t)">编辑</button>
              <button type="button" class="link danger" @click="$emit('remove', t)">删除</button>
            </span>
          </template>
          <button v-else-if="matched.has(t.id)" type="button" class="pill pill--accent done" @click="$emit('open', matched.get(t.id)!)">
            ✓ {{ hm(matched.get(t.id)!.time) }}
          </button>
          <van-button v-else-if="canRecord && !locked" size="mini" round plain type="primary" @click="$emit('record', t)">去记录</van-button>
        </div>
        <div v-if="matched.has(t.id)" class="actual row">
          <span class="ellipsis grow">{{ summarizeLog(matched.get(t.id)!) }}</span>
          <AuthorTag :user-id="matched.get(t.id)!.createdBy" />
        </div>
        <div v-else-if="t.desc" class="muted desc ellipsis">{{ t.desc }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.timeline {
  padding: var(--sp-2) var(--sp-4);
}

.slot {
  display: flex;
  align-items: flex-start;
  gap: var(--sp-3);
  padding: var(--sp-2) 0;
  position: relative;
}

.slot:not(:last-child)::after {
  content: '';
  position: absolute;
  left: 61px;
  top: 38px;
  bottom: -8px;
  width: 2px;
  background: var(--bc-border);
}

.time {
  width: 40px;
  padding-top: 5px;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: var(--bc-text-2);
}

.slot--evening .time {
  color: #8e7cf3;
}

.dot {
  flex: none;
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--bc-surface-2);
  z-index: 1;
}

.slot--done .dot {
  background: var(--bc-accent-soft);
  box-shadow: 0 0 0 2px var(--bc-accent);
}

.body {
  padding-top: 4px;
  min-height: 36px;
}

.title {
  font-weight: 600;
}

.title .muted {
  font-weight: 400;
  font-size: 12px;
}

.done {
  border: 0;
  cursor: pointer;
}

.actual {
  font-size: 12px;
  color: var(--bc-text-2);
}

.desc {
  font-size: 12px;
}

.link {
  font-size: 13px;
  min-height: 28px;
}

.danger {
  color: var(--bc-danger);
}
</style>
