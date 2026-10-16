<!-- ==========================================================================
  打卡弹层：宝宝表现四档评分 · 表现标签 · 观察记录 · 实际时长
=========================================================================== -->
<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { PERFORMANCE_TAGS, RATINGS } from '@/shared/constants'
import type { PlanTask, Rating } from '@/shared/types'
import { libraryOf } from '@/domain/planner'
import { useAction } from '@/composables/useAction'
import { checkin } from '@/services/plan'
import ChipGroup from '@/components/ChipGroup.vue'
import AppSheet from '@/components/AppSheet.vue'

const props = defineProps<{ task: PlanTask | null }>()
const show = defineModel<boolean>('show', { required: true })

const { busy, run } = useAction()
const form = reactive({ rating: 4 as Rating, tags: [] as string[], note: '', duration: null as number | null })

const hint = computed(() => {
  const it = props.task ? libraryOf(props.task) : undefined
  if (!it || 'ingredients' in it) {
    return ''
  }
  return 'observe' in it ? it.observe : it.tip
})
const planned = computed(() => {
  const it = props.task ? libraryOf(props.task) : undefined
  return it && 'duration' in it ? it.duration : null
})

watch(show, (v) => {
  if (v) {
    Object.assign(form, { rating: 4, tags: [], note: '', duration: planned.value })
  }
})

async function submit() {
  const task = props.task
  if (!task) {
    return
  }
  const ok = await run(() => checkin(task, { ...form }), '打卡成功')
  if (ok) {
    show.value = false
  }
}
</script>

<template>
  <AppSheet v-model:show="show" title="活动打卡" confirm-text="完成" :busy="busy" @confirm="submit">
    <div v-if="task">
      <h3 class="task-name">{{ task.title }}</h3>
      <p v-if="hint" class="hint">{{ hint }}</p>

      <div class="form-label">宝宝表现</div>
      <div class="ratings">
        <button
          v-for="r in RATINGS" :key="r.value" type="button" class="rate" :class="{ on: form.rating === r.value }"
          :aria-pressed="form.rating === r.value" @click="form.rating = r.value"
        >
          <span class="emoji">{{ r.icon }}</span>{{ r.label }}
        </button>
      </div>

      <div class="form-label">表现标签（可多选）</div>
      <ChipGroup v-model="form.tags" multiple :options="PERFORMANCE_TAGS.map((t) => ({ value: t, label: t }))" />

      <div class="form-label">表现记录（选填）</div>
      <textarea v-model="form.note" class="textarea" rows="3" maxlength="300" placeholder="如：能坚持抬头 20 秒，看到红球会追视…" />

      <div class="form-label">实际时长（分钟，选填）</div>
      <van-stepper
        :model-value="form.duration ?? 0" :min="0" :max="120" integer button-size="36px" input-width="56px"
        @update:model-value="(v) => (form.duration = Number(v) || null)"
      />

    </div>
  </AppSheet>
</template>

<style scoped>
.task-name { margin: 0 0 12px; font-size: 17px; font-weight: 600; }
.hint {
  margin: 0;
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--bc-radius-sm);
  background: var(--bc-warn-soft);
  font-size: 13px;
}

.ratings {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--sp-2);
}

.rate {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: var(--sp-3) 0;
  border: 1px solid var(--bc-border);
  border-radius: var(--bc-radius);
  background: var(--bc-surface);
  font-size: 13px;
  cursor: pointer;
}

.rate.on {
  border-color: var(--bc-text-3);
  background: var(--bc-surface-2);
  color: var(--bc-text);
  font-weight: 600;
}

.emoji {
  font-size: 28px;
}
</style>
