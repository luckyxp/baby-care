<!-- ==========================================================================
  任务编辑弹层（仅育儿嫂）：新建自定义任务 / 编辑已有任务
  ----------------------------------------------------------------------------
  喂养任务：类别、时间、计划量；早教 / 亲子：领域、日间或晚间（晚间留给家长）
=========================================================================== -->
<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { EDU_CATEGORIES, EDU_KEYS, FEED_KIND_META, SLOT_LABEL } from '@/shared/constants'
import type { Baby, DateKey, EduCategory, FeedKind, PlanTask, Slot, TaskKind } from '@/shared/types'
import { useAction } from '@/composables/useAction'
import { addCustomTask, updateTask, type TaskInput } from '@/services/plan'
import ChipGroup from '@/components/ChipGroup.vue'

const props = defineProps<{
  task: PlanTask | null
  baby: Baby
  date: DateKey
  defaults?: { kind: TaskKind; slot: Slot }
}>()
const show = defineModel<boolean>('show', { required: true })

const { busy, run } = useAction()
const form = reactive<TaskInput>({
  kind: 'edu', category: 'gross', slot: 'day', title: '', desc: '', steps: [], time: null, amount: null,
})
const stepsText = computed({
  get: () => form.steps.join('\n'),
  set: (v: string) => {
    form.steps = v.split('\n')
  },
})

const KIND_OPTIONS: { value: TaskKind; label: string; icon: string }[] = [
  { value: 'feeding', label: '喂养', icon: '🍼' },
  { value: 'edu', label: '早教', icon: '🎯' },
  { value: 'interaction', label: '亲子互动', icon: '💞' },
]
const feedOptions = (Object.keys(FEED_KIND_META) as FeedKind[]).map((k) => ({ value: k, label: FEED_KIND_META[k].label, icon: FEED_KIND_META[k].icon }))
const eduOptions = EDU_KEYS.map((k) => ({ value: k, label: EDU_CATEGORIES[k].label, icon: EDU_CATEGORIES[k].icon }))
const slotOptions = (['day', 'evening'] as Slot[]).map((s) => ({ value: s, label: s === 'day' ? `☀️ ${SLOT_LABEL.day}（育儿嫂）` : `🌙 ${SLOT_LABEL.evening}（留给爸妈）` }))

const feeding = computed(() => form.kind === 'feeding')
const hasAmount = computed(() => feeding.value && (form.category === 'milk' || form.category === 'water'))

watch(show, (v) => {
  if (!v) {
    return
  }
  const t = props.task
  if (t) {
    Object.assign(form, { kind: t.kind, category: t.category, slot: t.slot, title: t.title, desc: t.desc, steps: [...t.steps], time: t.time, amount: t.amount })
    return
  }
  const kind = props.defaults?.kind ?? 'edu'
  Object.assign(form, {
    kind, category: kind === 'feeding' ? 'milk' : 'gross', slot: props.defaults?.slot ?? 'day',
    title: '', desc: '', steps: [], time: kind === 'feeding' ? '12:00' : null, amount: kind === 'feeding' ? 120 : null,
  })
})

function onKind(k: TaskKind) {
  form.category = k === 'feeding' ? 'milk' : 'gross'
  form.time = k === 'feeding' ? (form.time ?? '12:00') : form.time
  form.amount = k === 'feeding' ? (form.amount ?? 120) : null
}

async function save() {
  if (!form.title.trim()) {
    await run(() => Promise.reject(new Error('请填写任务名称')))
    return
  }
  const input: TaskInput = { ...form, steps: [...form.steps], category: form.category as FeedKind | EduCategory }
  const ok = await run(() => (props.task ? updateTask(props.task, input) : addCustomTask(props.baby, props.date, input)), '已保存')
  if (ok) {
    show.value = false
  }
}
</script>

<template>
  <van-popup v-model:show="show" position="bottom" round closeable teleport="body" :style="{ maxWidth: 'var(--bc-max-w)', left: '50%', transform: 'translateX(-50%)' }">
    <div class="sheet">
      <div class="sheet-head"><div class="sheet-title">{{ task ? '编辑任务' : '自定义任务' }}</div></div>

      <template v-if="!task">
        <div class="form-label">任务类型</div>
        <ChipGroup v-model="form.kind" :options="KIND_OPTIONS" @update:model-value="(k) => onKind(k as TaskKind)" />
      </template>

      <div class="form-label">{{ feeding ? '喂养类别' : '所属领域' }}</div>
      <ChipGroup v-if="feeding" v-model="form.category" :options="feedOptions" />
      <ChipGroup v-else v-model="form.category" :options="eduOptions" />

      <div class="form-label">任务名称</div>
      <van-field v-model="form.title" class="field" :placeholder="feeding ? '如 午奶、午餐辅食' : '如 趴着找玩具'" maxlength="30" />

      <template v-if="!feeding">
        <div class="form-label">时段</div>
        <ChipGroup v-model="form.slot" :options="slotOptions" />
      </template>

      <div class="form-label">{{ feeding ? '时间' : '时间（选填）' }}</div>
      <div class="row">
        <input v-model="form.time" type="time" class="time-input" />
        <button v-if="form.time && !feeding" type="button" class="link" @click="form.time = null">清除</button>
      </div>

      <template v-if="hasAmount">
        <div class="form-label">计划量（ml）</div>
        <van-stepper
          :model-value="form.amount ?? 0" :min="0" :max="400" :step="10" integer button-size="36px" input-width="64px"
          @update:model-value="(v) => (form.amount = Number(v) || null)"
        />
      </template>

      <div class="form-label">说明 / 目标（选填）</div>
      <textarea v-model="form.desc" class="textarea" rows="2" maxlength="200" />

      <div class="form-label">步骤（每行一步，选填）</div>
      <textarea v-model="stepsText" class="textarea" rows="3" maxlength="500" />

      <div class="sheet-actions">
        <van-button round block type="primary" :loading="busy" @click="save">保存</van-button>
      </div>
    </div>
  </van-popup>
</template>

<style scoped>
.field {
  border: 1px solid var(--bc-border);
  border-radius: var(--bc-radius-sm);
}

.time-input {
  height: 40px;
  padding: 0 var(--sp-3);
  border: 1px solid var(--bc-border);
  border-radius: var(--bc-radius-sm);
  background: var(--bc-surface);
  font-size: 16px;
}
</style>
