<!-- ==========================================================================
  24 小时时间轴：一眼看清一天的吃、睡、拉
  ----------------------------------------------------------------------------
  四条轨道：睡眠（色块，跨夜按当天窗口截断）/ 喂养 / 排便 / 体温·用药（圆点）
  今天额外标出"现在"的位置。按百分比定位，天然自适应宽度。
=========================================================================== -->
<script setup lang="ts">
import { computed, ref } from 'vue'

const selected = ref('')
import { LOG_KINDS } from '@/shared/constants'
import type { CareLog, DateKey, LogType } from '@/shared/types'
import { abnormalReason, summarizeLog } from '@/domain/log-kinds'
import { dayWindow } from '@/domain/stats'
import { dateKey, hm } from '@/utils/time'

const props = defineProps<{ date: DateKey; logs: CareLog[]; now: number }>()

const DAY = 24 * 3600 * 1000
const TRACKS: { key: string; label: string; types: LogType[] }[] = [
  { key: 'feed', label: '喂养', types: ['milk', 'solid'] },
  { key: 'diaper', label: '排便', types: ['diaper'] },
  { key: 'health', label: '健康', types: ['temp', 'medicine'] },
]
const TICKS = [0, 3, 6, 9, 12, 15, 18, 21, 24]

const view = computed(() => {
  const [from, to] = dayWindow(props.date)
  const pct = (t: number) => `${(((t - from) / DAY) * 100).toFixed(2)}%`
  const sleeps = props.logs
    .filter((l) => l.type === 'sleep')
    .map((l) => ({ log: l, start: Math.max(l.time, from), end: Math.min(l.endTime ?? props.now, to) }))
    .filter((s) => s.end > s.start)
    .map((s) => ({
      id: s.log.id,
      left: pct(s.start),
      width: `${(((s.end - s.start) / DAY) * 100).toFixed(2)}%`,
      ongoing: s.log.endTime === null,
      title: summarizeLog(s.log, props.now),
    }))
  const tracks = TRACKS.map((t) => ({
    ...t,
    dots: props.logs
      .filter((l) => l.date === props.date && t.types.includes(l.type))
      .map((l) => ({
        id: l.id,
        left: pct(l.time),
        color: LOG_KINDS[l.type].color,
        alert: !!abnormalReason(l),
        title: `${hm(l.time)} ${summarizeLog(l)}`,
      })),
  }))
  const nowLeft = dateKey(props.now) === props.date ? pct(props.now) : null
  return { sleeps, tracks, nowLeft }
})
</script>

<template>
  <div class="timeline">
    <div class="track">
      <span class="t-label">睡眠</span>
      <div class="lane">
        <button
          v-for="s in view.sleeps"
          :key="s.id"
          class="sleep"
          :class="{ ongoing: s.ongoing }"
          :style="{ left: s.left, width: s.width }"
          :title="s.title" :aria-label="s.title" type="button" @click="selected = s.title" @focus="selected = s.title"
        />
        <span v-if="view.nowLeft" class="now" :style="{ left: view.nowLeft }" />
      </div>
    </div>
    <div v-for="t in view.tracks" :key="t.key" class="track">
      <span class="t-label">{{ t.label }}</span>
      <div class="lane">
        <button
          v-for="d in t.dots"
          :key="d.id"
          class="dot"
          :class="{ alert: d.alert }"
          :style="{ left: d.left, background: d.color }"
          :title="d.title" :aria-label="d.title" type="button" @click="selected = d.title" @focus="selected = d.title"
        />
        <span v-if="view.nowLeft" class="now" :style="{ left: view.nowLeft }" />
      </div>
    </div>
    <div class="track axis">
      <span class="t-label" />
      <div class="lane lane--axis">
        <span v-for="h in TICKS" :key="h" class="tick" :style="{ left: `${(h / 24) * 100}%` }">{{ h }}</span>
      </div>
    </div>
    <p class="selected" role="status">{{ selected || '点选记录查看时间与内容' }}</p>
    <div class="legend">
      <span><i class="sw sleep-sw" />睡眠</span>
      <span v-for="k in (['milk', 'solid', 'diaper', 'temp', 'medicine'] as LogType[])" :key="k">
        <i class="sw" :style="{ background: LOG_KINDS[k].color }" />{{ LOG_KINDS[k].label }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.timeline {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.track {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
}

.t-label {
  width: 30px;
  flex: none;
  font-size: 11px;
  color: var(--bc-text-3);
}

.lane {
  position: relative;
  flex: 1;
  height: 18px;
  border-radius: 9px;
  background: var(--bc-surface-2);
}

.lane--axis {
  height: 14px;
  background: none;
}

.selected { margin: 0; font-size: 12px; color: var(--bc-text-2); }
.sleep { border: 0; cursor: pointer;
  position: absolute;
  top: 2px;
  bottom: 2px;
  min-width: 3px;
  border-radius: 7px;
  background: #8e7cf3;
  opacity: 0.85;
}

.sleep.ongoing {
  background: repeating-linear-gradient(45deg, #8e7cf3, #8e7cf3 4px, #b3a7f7 4px, #b3a7f7 8px);
}

.dot {
  position: absolute;
  top: 50%;
  width: 10px;
  height: 10px;
  margin: -5px 0 0 -5px;
  border-radius: 50%;
  border: 2px solid var(--bc-surface);
}

.dot.alert {
  box-shadow: 0 0 0 2px var(--bc-danger);
}

.now {
  position: absolute;
  top: -3px;
  bottom: -3px;
  width: 2px;
  margin-left: -1px;
  background: var(--bc-danger);
  border-radius: 1px;
}

.tick {
  position: absolute;
  transform: translateX(-50%);
  font-size: 10px;
  color: var(--bc-text-3);
  font-variant-numeric: tabular-nums;
}

.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin-top: 4px;
  padding-left: 38px;
  font-size: 11px;
  color: var(--bc-text-2);
}

.legend span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.sw {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.sleep-sw {
  width: 14px;
  border-radius: 4px;
  background: #8e7cf3;
}
</style>
