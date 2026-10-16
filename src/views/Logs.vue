<!-- ==========================================================================
  护理日志：按天浏览全部记录，可按类型筛选；支持 ?date=&focus= 从消息直达某条记录
=========================================================================== -->
<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { LOG_KINDS, LOG_TYPES } from '@/shared/constants'
import type { CareLog, LogType } from '@/shared/types'
import { summarizeDay } from '@/domain/stats'
import ChipGroup from '@/components/ChipGroup.vue'
import DateBar from '@/components/DateBar.vue'
import LogItem from '@/components/LogItem.vue'
import LogSheet from '@/components/LogSheet.vue'
import PageNav from '@/components/PageNav.vue'
import VoiceSheet from '@/components/VoiceSheet.vue'
import { useClock } from '@/composables/useClock'
import { useDay } from '@/composables/useDay'
import { fmtDuration } from '@/utils/time'

const route = useRoute()
const { now, today } = useClock()

const date = ref(String(route.query.date ?? today.value))
const focus = ref(String(route.query.focus ?? ''))
const filter = ref<LogType | 'all'>('all')
const day = useDay(date)

watch(
  () => route.query,
  (q) => {
    date.value = String(q.date ?? date.value)
    focus.value = String(q.focus ?? '')
  },
)

const counts = computed(() => {
  const m = new Map<LogType, number>()
  day.dayLogs.value.forEach((l) => m.set(l.type, (m.get(l.type) ?? 0) + 1))
  return m
})

const filterOptions = computed(() => [
  { value: 'all' as const, label: `全部 ${day.dayLogs.value.length}` },
  ...LOG_TYPES.filter((t) => counts.value.get(t)).map((t) => ({ value: t, label: `${LOG_KINDS[t].label} ${counts.value.get(t)}` })),
])

const list = computed(() =>
  [...day.dayLogs.value].reverse().filter((l) => filter.value === 'all' || l.type === filter.value),
)
const summary = computed(() => summarizeDay(date.value, day.logs.value, now.value))

/* ── 弹层 ───────────────────────────────────────────────────────────────── */

const sheet = ref(false)
const sheetLog = ref<CareLog | null>(null)
const voice = ref(false)

function open(log: CareLog | null) {
  sheetLog.value = log
  sheet.value = true
}

// 从消息跳转过来：定位并高亮，然后自动打开详情
watch(
  () => [focus.value, day.dayLogs.value.length] as const,
  async ([id]) => {
    const log = id ? day.dayLogs.value.find((l) => l.id === id) : undefined
    if (!log) {
      return
    }
    await nextTick()
    document.getElementById(`log-${id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    open(log)
    focus.value = ''
  },
  { immediate: true },
)
</script>

<template>
  <div class="page">
    <PageNav>
      <template #right><button type="button" class="icon-button" aria-label="语音记录" @click="voice = true"><van-icon name="volume-o" size="20" /></button></template>
    </PageNav>

    <div class="page-body">
      <div class="bar"><DateBar v-model="date" /></div>

      <div class="card sum">
        <span>奶量 <b>{{ summary.milkMl }}</b>ml</span>
        <span>辅食 <b>{{ summary.solidCount }}</b>次</span>
        <span>睡眠 <b>{{ fmtDuration(summary.sleepMin) }}</b></span>
        <span>大/小便 <b>{{ summary.poop }}/{{ summary.pee }}</b></span>
      </div>

      <div class="filters">
        <ChipGroup v-model="filter" :options="filterOptions" />
      </div>

      <div class="card timeline">
        <div v-for="log in list" :id="`log-${log.id}`" :key="log.id">
          <LogItem :log="log" :notes="day.notesOf('log', log.id).length" :focus="log.id === route.query.focus" @open="open" />
        </div>
        <van-empty v-if="!list.length" image-size="72" description="这一天没有记录" />
      </div>
    </div>

    <button class="fab" type="button" aria-label="新增记录" @click="open(null)">
      <van-icon name="plus" size="26" />
    </button>

    <LogSheet v-model:show="sheet" :log="sheetLog" :preset="sheetLog ? null : { time: date === today ? Date.now() : new Date(`${date}T12:00:00`).getTime() }" />
    <VoiceSheet v-model:show="voice" />
  </div>
</template>

<style scoped>
.bar {
  margin: var(--sp-2) 0 var(--sp-3);
}

.sum {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: var(--sp-2);
  font-size: 13px;
  color: var(--bc-text-2);
}

.sum b {
  color: var(--bc-text);
  font-size: 15px;
  font-variant-numeric: tabular-nums;
}

.filters {
  margin-bottom: var(--sp-3);
}

.filters :deep(.chip) {
  min-height: 44px;
  font-size: 13px;
  padding: 0 10px;
}

.timeline {
  padding-top: var(--sp-1);
  padding-bottom: var(--sp-1);
}

.fab {
  position: fixed;
  right: max(var(--sp-5), calc(50vw - var(--bc-max-w) / 2 + var(--sp-5)));
  bottom: calc(var(--sp-6) + env(safe-area-inset-bottom));
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  border: 0;
  border-radius: 16px;
  background: var(--bc-primary);
  color: var(--bc-on-primary);
  box-shadow: var(--bc-shadow-lg);
  cursor: pointer;
}
</style>
