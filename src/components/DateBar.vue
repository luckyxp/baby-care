<!-- ==========================================================================
  日期切换条：‹ 今天 › + 点击标题弹出日历；不允许切到 max 之后
=========================================================================== -->
<script setup lang="ts">
import { computed, ref } from 'vue'
import type { DateKey } from '@/shared/types'
import { dateKey, dateLabel, dayjs, shiftDate } from '@/utils/time'
import { useClock } from '@/composables/useClock'

const props = defineProps<{ max?: DateKey; min?: DateKey }>()
const date = defineModel<DateKey>({ required: true })
const { today } = useClock()

const upper = computed(() => props.max ?? today.value)
const showCal = ref(false)
const canNext = computed(() => date.value < upper.value)
const canPrev = computed(() => !props.min || date.value > props.min)

function go(n: number) {
  const next = shiftDate(date.value, n)
  if (next <= upper.value && (!props.min || next >= props.min)) {
    date.value = next
  }
}

function pick(d: Date) {
  date.value = dateKey(d)
  showCal.value = false
}
</script>

<template>
  <div class="datebar">
    <button class="nav" type="button" :disabled="!canPrev" aria-label="前一天" @click="go(-1)">
      <van-icon name="arrow-left" />
    </button>
    <button class="title" type="button" @click="showCal = true">
      {{ dateLabel(date, today) }}
      <small v-if="date === today || date === shiftDate(today, -1)">{{ dayjs(date).format('M月D日') }}</small>
      <van-icon name="arrow-down" size="12" />
    </button>
    <button class="nav" type="button" :disabled="!canNext" aria-label="后一天" @click="go(1)">
      <van-icon name="arrow" />
    </button>
    <button v-if="date !== today && today <= upper" class="today link" type="button" @click="date = today">回今天</button>

    <van-calendar
      v-model:show="showCal"
      :default-date="dayjs(date).toDate()"
      :min-date="dayjs(min ?? shiftDate(today, -365)).toDate()"
      :max-date="dayjs(upper).toDate()"
      :show-confirm="false"
      first-day-of-week="1"
      title="选择日期"
      @select="pick"
    />
  </div>
</template>

<style scoped>
.datebar {
  display: flex;
  align-items: center;
  gap: var(--sp-1);
  position: relative;
}

.nav {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 50%;
  background: var(--bc-surface);
  color: var(--bc-text-2);
  box-shadow: var(--bc-shadow);
  cursor: pointer;
}

.nav:disabled {
  opacity: 0.35;
}

.title {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 36px;
  border: 0;
  background: none;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
}

.title small {
  font-size: 12px;
  font-weight: 400;
  color: var(--bc-text-3);
}

.today {
  position: absolute;
  right: 48px;
  font-size: 12px;
}
</style>
