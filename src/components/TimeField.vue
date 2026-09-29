<!-- ==========================================================================
  时间字段：显示"今天 14:20"，点击弹出 日期 + 时间 选择；不允许晚于当前时间
=========================================================================== -->
<script setup lang="ts">
import { ref } from 'vue'
import { showToast } from 'vant'
import { dateKey, dateLabel, dayjs, hm } from '@/utils/time'

const props = withDefaults(defineProps<{ label?: string; allowFuture?: boolean; disabled?: boolean }>(), {
  label: '时间',
  allowFuture: false,
  disabled: false,
})
const model = defineModel<number>({ required: true })

const show = ref(false)
const tab = ref(1)
const date = ref<string[]>([])
const time = ref<string[]>([])

function open() {
  if (props.disabled) {
    return
  }
  const t = dayjs(model.value)
  date.value = [t.format('YYYY'), t.format('MM'), t.format('DD')]
  time.value = [t.format('HH'), t.format('mm')]
  tab.value = 1
  show.value = true
}

function confirm() {
  const t = dayjs(`${date.value.join('-')} ${time.value.join(':')}`).valueOf()
  if (!props.allowFuture && t > Date.now() + 60_000) {
    showToast('不能晚于当前时间')
    return
  }
  model.value = t
  show.value = false
}

const quick = (min: number) => {
  model.value = Date.now() - min * 60_000
}
</script>

<template>
  <div class="tf">
    <button type="button" class="tf-value" :disabled="disabled" @click="open">
      <van-icon name="clock-o" />
      <span>{{ dateKey(model) === dateKey() ? '' : dateLabel(dateKey(model)) + ' ' }}{{ hm(model) }}</span>
      <van-icon v-if="!disabled" name="arrow-down" size="12" />
    </button>
    <template v-if="!disabled">
      <button type="button" class="tf-quick" @click="quick(0)">现在</button>
      <button type="button" class="tf-quick" @click="quick(15)">15分钟前</button>
      <button type="button" class="tf-quick" @click="quick(30)">半小时前</button>
    </template>

    <van-popup v-model:show="show" position="bottom" round teleport="body">
      <van-picker-group v-model:active-tab="tab" :title="label" :tabs="['日期', '时间']" @confirm="confirm" @cancel="show = false">
        <van-date-picker v-model="date" :min-date="dayjs().subtract(1, 'year').toDate()" :max-date="dayjs().add(allowFuture ? 30 : 0, 'day').toDate()" />
        <van-time-picker v-model="time" />
      </van-picker-group>
    </van-popup>
  </div>
</template>

<style scoped>
.tf {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-2);
}

.tf-value {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 14px;
  border: 1px solid var(--bc-primary);
  border-radius: 999px;
  background: var(--bc-primary-soft);
  color: var(--bc-primary-dark);
  font-weight: 600;
  font-size: 15px;
  cursor: pointer;
}

.tf-value:disabled {
  border-color: var(--bc-border);
  background: var(--bc-surface-2);
  color: var(--bc-text);
}

.tf-quick {
  height: 30px;
  padding: 0 10px;
  border: 0;
  border-radius: 999px;
  background: var(--bc-surface-2);
  color: var(--bc-text-2);
  font-size: 12px;
  cursor: pointer;
}
</style>
