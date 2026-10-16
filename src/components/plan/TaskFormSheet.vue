<!-- ==========================================================================
  任务表单弹层：计划与日模板共用，只提交内容，不直接写入数据库
  ----------------------------------------------------------------------------
  喂养任务：类别、时间、计划量；早教 / 亲子：领域、日间或晚间（晚间留给家长）
=========================================================================== -->
<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { EDU_CATEGORIES, EDU_KEYS, FEED_KIND_META, SLOT_LABEL } from '@/shared/constants'
import type { FeedKind, Slot, TaskKind } from '@/shared/types'
import { useAction } from '@/composables/useAction'
import { normalizeTaskInput, type TaskInput } from '@/domain/plan-task'
import ChipGroup from '@/components/ChipGroup.vue'
import AppSheet from '@/components/AppSheet.vue'

const props = defineProps<{
  task: TaskInput | null
  lockKind?: boolean
  allowedKinds?: readonly TaskKind[]
  title?: string
  saving?: boolean
  defaults?: { kind: TaskKind; slot: Slot }
}>()
const show = defineModel<boolean>('show', { required: true })
const emit = defineEmits<{ save: [input: TaskInput] }>()

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

const KIND_OPTIONS: { value: TaskKind; label: string; symbol: string }[] = [
  { value: 'feeding', label: '喂养', symbol: 'milk' },
  { value: 'edu', label: '早教', symbol: 'gross' },
  { value: 'interaction', label: '亲子互动', symbol: 'social' },
]
const kindOptions = computed(() => KIND_OPTIONS.filter((option) => !props.allowedKinds || props.allowedKinds.includes(option.value)))
const feedOptions = (Object.keys(FEED_KIND_META) as FeedKind[]).map((k) => ({ value: k, label: FEED_KIND_META[k].label, symbol: k }))
const eduOptions = EDU_KEYS.map((k) => ({ value: k, label: EDU_CATEGORIES[k].label, symbol: k }))
const slotOptions = (['day', 'evening'] as Slot[]).map((s) => ({ value: s, label: SLOT_LABEL[s] }))

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
  const kind = props.defaults?.kind ?? props.allowedKinds?.[0] ?? 'edu'
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
  if (props.allowedKinds && !props.allowedKinds.includes(form.kind)) {
    await run(() => Promise.reject(new Error('任务类型与当前模板不符')))
    return
  }
  if (!form.title.trim()) {
    await run(() => Promise.reject(new Error('请填写任务名称')))
    return
  }
  const input = await run(async () => normalizeTaskInput({ ...form, steps: [...form.steps] }))
  if (input) {
    const { assignee: _assignee, ...content } = input
    emit('save', content)
  }
}
</script>

<template>
  <AppSheet v-model:show="show" :title="title ?? (task ? '编辑任务' : '添加任务')" :confirm-text="task ? '保存' : '添加'" :busy="busy || saving" :disabled="!form.title.trim()" @confirm="save">
    <section v-if="!lockKind && kindOptions.length > 1" class="form-section">
      <ChipGroup v-model="form.kind" :options="kindOptions" segmented @update:model-value="(k) => onKind(k as TaskKind)" />
    </section>
    <section class="form-section">
      <label class="form-label" for="task-title">名称</label>
      <van-field id="task-title" v-model="form.title" :placeholder="feeding ? '如 午奶、午餐辅食' : '如 趴着找玩具'" maxlength="30" clearable />
    </section>
    <section class="form-section">
      <div class="form-label">{{ feeding ? '喂养类别' : '所属领域' }}</div>
      <ChipGroup v-model="form.category" :options="feeding ? feedOptions : eduOptions" />
    </section>
    <section v-if="!feeding" class="form-section">
      <div class="form-label">时段</div><ChipGroup v-model="form.slot" :options="slotOptions" />
    </section>
    <section class="form-section inline-fields">
      <label for="task-time">时间 <small v-if="!feeding">选填</small></label>
      <div class="row"><input id="task-time" v-model="form.time" type="time" class="time-input" /><button v-if="form.time && !feeding" type="button" class="link" @click="form.time = null">清除</button></div>
    </section>
    <section v-if="hasAmount" class="form-section inline-fields">
      <span>计划量 <small>ml</small></span>
      <van-stepper :model-value="form.amount ?? 0" :min="0" :max="400" :step="10" integer button-size="32px" input-width="56px" @update:model-value="(v) => (form.amount = Number(v))" />
    </section>
    <section class="form-section">
      <label class="form-label" for="task-desc">说明 / 目标 <small>选填</small></label>
      <textarea id="task-desc" v-model="form.desc" class="textarea" rows="2" maxlength="200" placeholder="补充这项安排的目标" />
    </section>
    <section class="form-section">
      <label class="form-label" for="task-steps">步骤 <small>选填，每行一步</small></label>
      <textarea id="task-steps" v-model="stepsText" class="textarea" rows="3" maxlength="500" placeholder="填写具体做法" />
    </section>
  </AppSheet>
</template>

<style scoped>
.form-label { display: block; }
.inline-fields { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-block: 4px; }
.inline-fields small { font-size: 12px; color: var(--bc-text-3); margin-left: 4px; }
.time-input { width: 118px; min-height: 40px; padding: 0 10px; border: 0; border-radius: 8px; background: var(--bc-surface-2); font-size: 16px; }
.inline-fields .link { font-size: 12px; }
</style>
