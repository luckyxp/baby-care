<!-- ==========================================================================
  宝宝档案表单：创建家庭（Onboard）与编辑档案（BabyEdit）共用
  —— v-model 为 BabyInput；通过 defineExpose 暴露 validate() 供父组件提交前校验
=========================================================================== -->
<script lang="ts">
import type { FeedingMode, Gender } from '@/shared/types'

export const GENDER_LABEL: Record<Gender, string> = { girl: '女宝', boy: '男宝' }
export const FEEDING_LABEL: Record<FeedingMode, string> = { breast: '母乳', formula: '配方奶', mixed: '混合喂养' }
</script>

<script setup lang="ts">
import { ref } from 'vue'
import type { BabyInput } from '@/shared/types'
import ChipGroup from '@/components/ChipGroup.vue'
import { ageOf, ageText, dateKey, dayjs } from '@/utils/time'

const props = withDefaults(defineProps<{ readonly?: boolean }>(), { readonly: false })
const model = defineModel<BabyInput>({ required: true })

const showDate = ref(false)
const picked = ref<string[]>([])

function set<K extends keyof BabyInput>(key: K, value: BabyInput[K]) {
  model.value = { ...model.value, [key]: value }
}

const num = (v: string | number) => (v === '' || Number.isNaN(Number(v)) ? null : Number(v))

function openDate() {
  if (props.readonly) {
    return
  }
  picked.value = model.value.birthday.split('-')
  showDate.value = true
}

function confirmDate() {
  set('birthday', picked.value.join('-'))
  showDate.value = false
}

function validate(): string | null {
  const b = model.value
  if (!b.name.trim()) {
    return '请填写宝宝的小名'
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.birthday) || b.birthday > dateKey()) {
    return '请选择正确的生日'
  }
  if (b.birthWeight !== null && (b.birthWeight < 0.5 || b.birthWeight > 6)) {
    return '出生体重应在 0.5-6kg 之间'
  }
  if (b.birthHeight !== null && (b.birthHeight < 25 || b.birthHeight > 65)) {
    return '出生身长应在 25-65cm 之间'
  }
  return null
}

defineExpose({ validate })

const opts = <K extends string>(labels: Record<K, string>) => (Object.keys(labels) as K[]).map((value) => ({ value, label: labels[value] }))
</script>

<template>
  <div class="baby-form">
    <div class="form-label">宝宝小名</div>
    <van-field
      :model-value="model.name"
      class="field"
      placeholder="如 小米粒"
      maxlength="10"
      :readonly="readonly"
      @update:model-value="(v) => set('name', v)"
    />

    <div class="form-label">性别</div>
    <ChipGroup :model-value="model.gender" :options="opts(GENDER_LABEL)" :disabled="readonly" @update:model-value="(v) => set('gender', v as BabyInput['gender'])" />

    <div class="form-label">生日</div>
    <button type="button" class="date" :disabled="readonly" @click="openDate">
      <van-icon name="calendar-o" />
      <span>{{ dayjs(model.birthday).format('YYYY年M月D日') }}</span>
      <span class="muted">· {{ ageText(ageOf(model.birthday)) }}</span>
    </button>

    <div class="form-label">喂养方式</div>
    <ChipGroup :model-value="model.feedingMode" :options="opts(FEEDING_LABEL)" :disabled="readonly" @update:model-value="(v) => set('feedingMode', v as BabyInput['feedingMode'])" />

    <div class="form-label">出生数据（选填）</div>
    <div class="pair">
      <van-field
        :model-value="model.birthWeight ?? ''"
        class="field"
        type="number"
        placeholder="体重"
        :readonly="readonly"
        @update:model-value="(v) => set('birthWeight', num(v))"
      >
        <template #right-icon><span class="muted">kg</span></template>
      </van-field>
      <van-field
        :model-value="model.birthHeight ?? ''"
        class="field"
        type="number"
        placeholder="身长"
        :readonly="readonly"
        @update:model-value="(v) => set('birthHeight', num(v))"
      >
        <template #right-icon><span class="muted">cm</span></template>
      </van-field>
    </div>

    <div class="form-label">过敏 / 特别注意（选填）</div>
    <van-field
      :model-value="model.allergies"
      class="field"
      type="textarea"
      rows="2"
      autosize
      maxlength="100"
      placeholder="如 鸡蛋过敏、湿疹体质"
      :readonly="readonly"
      @update:model-value="(v) => set('allergies', v)"
    />

    <van-popup v-model:show="showDate" position="bottom" round teleport="body">
      <van-date-picker
        v-model="picked"
        title="宝宝生日"
        :min-date="dayjs().subtract(4, 'year').toDate()"
        :max-date="new Date()"
        @confirm="confirmDate"
        @cancel="showDate = false"
      />
    </van-popup>
  </div>
</template>

<style scoped>
.field {
  border: 1px solid var(--bc-border);
  border-radius: var(--bc-radius-sm);
}

.pair {
  display: flex;
  gap: var(--sp-2);
}

.pair > * {
  flex: 1;
}

.date {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  height: 44px;
  padding: 0 var(--sp-3);
  border: 1px solid var(--bc-border);
  border-radius: var(--bc-radius-sm);
  background: var(--bc-surface);
  cursor: pointer;
}

.date:disabled {
  cursor: default;
}
</style>
