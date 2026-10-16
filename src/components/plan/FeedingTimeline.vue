<!-- ==========================================================================
  喂养时间轴：按计划时点排列；记录日志即自动完成（无需单独打卡）
=========================================================================== -->
<script setup lang="ts">
import type { CareLog, PlanTask } from '@/shared/types'
import AppIcon from '@/components/AppIcon.vue'
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
    <div v-for="t in tasks" :id="`task-${t.id}`" :key="t.id" class="slot" :class="{ 'slot--done': matched.has(t.id) }">
      <time class="time">{{ t.time ?? '--:--' }}</time>
      <div class="grow body">
        <div class="title">{{ t.title }} <span v-if="planned(t)" class="amount">{{ planned(t) }}</span></div>
        <div v-if="matched.has(t.id)" class="actual"><span>{{ summarizeLog(matched.get(t.id)!) }}</span><AuthorTag :user-id="matched.get(t.id)!.createdBy" /></div>
        <div v-else-if="t.desc" class="desc ellipsis">{{ t.desc }}</div>
      </div>
      <span v-if="editing" class="edit-actions"><button type="button" class="icon-button" aria-label="编辑喂养任务" @click="$emit('edit', t)"><AppIcon name="edit" :size="17" /></button><button type="button" class="icon-button danger" aria-label="删除喂养任务" @click="$emit('remove', t)"><AppIcon name="delete" :size="17" /></button></span>
      <button v-else-if="matched.has(t.id)" type="button" class="done" @click="$emit('open', matched.get(t.id)!)"><AppIcon name="check" :size="14" />{{ hm(matched.get(t.id)!.time) }}</button>
      <button v-else-if="canRecord && !locked" type="button" class="record" @click="$emit('record', t)"><span>记录</span></button>
    </div>
  </div>
</template>

<style scoped>
.timeline { padding: 0 16px; }
.slot { display: flex; align-items: center; gap: 12px; min-height: 70px; padding: 12px 0; }
.slot + .slot { border-top: 1px solid var(--bc-border); }
.time { width: 36px; flex: none; font-size: 12px; font-variant-numeric: tabular-nums; color: var(--bc-text-3); }
.title { font-weight: 500; font-size: 14px; overflow-wrap: anywhere; }
.amount { font-weight: 400; font-size: 12px; color: var(--bc-text-3); white-space: nowrap; margin-left: 4px; }
.done { display: inline-flex; align-items: center; justify-content: flex-end; gap: 4px; padding: 0; min-height: 44px; min-width: 52px; border: 0; color: var(--bc-accent); background: transparent; font-size: 11px; font-variant-numeric: tabular-nums; cursor: pointer; }
.actual { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 8px; font-size: 11px; color: var(--bc-text-3); margin-top: 5px; }
.actual :deep(.author) { font-size: 10px; }
.desc { max-width: 180px; font-size: 11px; color: var(--bc-text-3); margin-top: 5px; }
.record { display: grid; place-items: center; width: 52px; height: 44px; padding: 0; border: 0; background: transparent; cursor: pointer; }
.record span { display: grid; place-items: center; min-width: 48px; height: 28px; border-radius: 15px; background: var(--bc-surface-2); font-size: 12px; }
.edit-actions { display: flex; align-items: center; }
.danger { color: var(--bc-danger); }
@media (max-width: 390px) { .slot { gap: 10px; } }
</style>
