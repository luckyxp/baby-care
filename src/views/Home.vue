<!-- ==========================================================================
  今天（首页）—— 为"抱着娃、单手、只有几秒"的场景设计
  ----------------------------------------------------------------------------
    ┌ 宝宝卡：月龄 · 阶段 · 同步状态 · 消息
    ├ 状态卡：距上次喂奶 / 下一顿计划 · 正在睡(一键醒了) · 今日累计
    ├ 快捷记录：8 类一点即记 + 语音
    ├ 今日计划进度（→ 计划页）
    ├ 家人留言板（交接事项，三方可见）
    └ 最近记录时间线（→ 日志页）
=========================================================================== -->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { showConfirmDialog } from 'vant'
import { LOG_KINDS, LOG_TYPES } from '@/shared/constants'
import type { CareLog, LogType } from '@/shared/types'
import { isSleeping, sleepMinutes, summarizeLog } from '@/domain/log-kinds'
import { matchFeeding } from '@/domain/planner'
import { summarizeDay, summarizeEdu } from '@/domain/stats'
import { stageOf } from '@/library'
import { db } from '@/db/client'
import { useLive } from '@/db/live'
import LogItem from '@/components/LogItem.vue'
import LogSheet from '@/components/LogSheet.vue'
import NoteThread from '@/components/NoteThread.vue'
import SyncStatus from '@/components/SyncStatus.vue'
import VoiceSheet from '@/components/VoiceSheet.vue'
import AppIcon from '@/components/AppIcon.vue'
import PlanProgress from '@/components/plan/PlanProgress.vue'
import { useAction } from '@/composables/useAction'
import { useClock } from '@/composables/useClock'
import { useDay } from '@/composables/useDay'
import { useNotices } from '@/composables/useNotices'
import { wakeUp } from '@/services/logs'
import { useSession } from '@/stores/session'
import { ageOf, ageText, atTime, dayjs, elapsed, fmtDuration, hm } from '@/utils/time'

const session = useSession()
const router = useRouter()
const { now, today } = useClock()
const { unread } = useNotices()
const { run } = useAction()
const day = useDay(today)

/* ── 宝宝 ───────────────────────────────────────────────────────────────── */

const baby = computed(() => session.baby)
const age = computed(() => (baby.value ? ageOf(baby.value.birthday, now.value) : null))
const stage = computed(() => (age.value ? stageOf(age.value.monthsFloat) : null))

const babySheet = ref(false)
const babyActions = computed(() => session.babies.map((b) => ({ name: b.name, subname: ageText(ageOf(b.birthday)), id: b.id })))

/* ── 状态卡 ─────────────────────────────────────────────────────────────── */

const lastOf = (type: LogType) =>
  useLive(
    async () => {
      const id = baby.value?.id
      return id ? ((await db().logs.where('[babyId+type+time]').between([id, type, 0], [id, type, Infinity]).last()) ?? null) : null
    },
    null as CareLog | null,
    [() => baby.value?.id],
  )

const lastMilk = lastOf('milk')
const lastSleep = lastOf('sleep')
const sleeping = computed(() => (lastSleep.value && isSleeping(lastSleep.value) ? lastSleep.value : null))
const summary = computed(() => summarizeDay(today.value, day.logs.value, now.value))

const nextFeed = computed(() => {
  const matched = matchFeeding(day.tasks.value, day.dayLogs.value)
  return (
    day.tasks.value
      .filter((t) => t.kind === 'feeding' && t.category === 'milk' && t.time && !matched.has(t.id))
      .find((t) => atTime(t.date, t.time!) >= now.value - 30 * 60_000) ?? null
  )
})

const planProgress = computed(() => {
  const matched = matchFeeding(day.tasks.value, day.dayLogs.value)
  const feeding = day.tasks.value.filter((t) => t.kind === 'feeding')
  const edu = summarizeEdu(day.tasks.value, day.checkins.value)
  return {
    feeding: { done: feeding.filter((t) => matched.has(t.id)).length, planned: feeding.length },
    edu: edu.edu,
    day: edu.day,
    evening: edu.evening,
    total: day.tasks.value.length,
  }
})
const progressItems = computed(() => [
  { label: '喂养', tone: 'feeding', ...planProgress.value.feeding }, { label: '早教', tone: 'edu', ...planProgress.value.edu },
  { label: '日间亲子', tone: 'day', ...planProgress.value.day }, { label: '晚间亲子', tone: 'evening', ...planProgress.value.evening },
])

/* ── 记录 ───────────────────────────────────────────────────────────────── */

const sheet = ref(false)
const sheetType = ref<LogType>('milk')
const sheetLog = ref<CareLog | null>(null)
const voice = ref(false)

async function record(type: LogType) {
  if (type === 'sleep' && sleeping.value) {
    await wake()
    return
  }
  sheetLog.value = null
  sheetType.value = type
  sheet.value = true
}

function open(log: CareLog) {
  sheetLog.value = log
  sheet.value = true
}

async function wake() {
  const log = sleeping.value
  if (!log) {
    return
  }
  await showConfirmDialog({
    title: '宝宝醒了？',
    message: `${hm(log.time)} 入睡，已睡 ${fmtDuration(sleepMinutes(log, Date.now()))}`,
    confirmButtonText: '醒了',
  })
  await run(() => wakeUp(log), '已记录醒来')
}

const recent = computed(() => [...day.dayLogs.value].reverse().slice(0, 6))
const noteCount = (log: CareLog) => day.notesOf('log', log.id).length
</script>

<template>
  <div class="page page--tab home">
    <header class="hero page-body">
      <div class="row row--between top">
        <span class="date-caption">{{ dayjs(today).format('M月D日 dddd') }}</span>
        <div class="row"><SyncStatus /><button class="icon-button" type="button" aria-label="消息" @click="router.push('/notices')"><van-badge :content="unread || undefined" max="99"><AppIcon name="bell" :size="21" /></van-badge></button></div>
      </div>
      <button v-if="baby" type="button" class="baby row" :disabled="session.babies.length < 2" aria-label="切换宝宝" @click="babySheet = true">
        <span class="avatar"><span v-if="baby.avatar">{{ baby.avatar }}</span><AppIcon v-else name="baby" :size="28" /></span>
        <span class="grow"><strong class="name">{{ baby.name }} <van-icon v-if="session.babies.length > 1" name="arrow-down" size="12" /></strong><span class="sub">{{ age && ageText(age) }} · {{ stage?.title }}</span></span>
      </button>
    </header>

    <main class="page-body">
      <section class="status list-panel" aria-label="当前状态">
        <button type="button" class="stat stat--milk" @click="record('milk')">
          <span class="stat-label"><AppIcon name="milk" :size="16" /> 距上次喂奶</span>
          <template v-if="lastMilk"><strong class="stat-value">{{ elapsed(lastMilk.time, now) }}</strong><span class="stat-sub">{{ hm(lastMilk.time) }} · {{ summarizeLog(lastMilk) }}</span></template>
          <strong v-else class="stat-value muted">暂无记录</strong>
          <span v-if="nextFeed" class="next">下一顿 {{ nextFeed.time }}{{ nextFeed.amount ? ` · ${nextFeed.amount}ml` : '' }}</span>
        </button>
        <button type="button" class="stat stat--sleep" @click="sleeping ? wake() : record('sleep')">
          <span class="stat-label"><AppIcon name="sleep" :size="16" /> {{ sleeping ? '正在睡眠' : '清醒中' }}</span>
          <template v-if="sleeping"><strong class="stat-value">{{ fmtDuration(sleepMinutes(sleeping, now)) }}</strong><span class="stat-sub">{{ hm(sleeping.time) }} 入睡</span><span class="next">记录醒来 <van-icon name="arrow" size="10" /></span></template>
          <template v-else-if="lastSleep?.endTime"><strong class="stat-value">{{ elapsed(lastSleep.endTime, now) }}</strong><span class="stat-sub">上一觉 {{ fmtDuration(sleepMinutes(lastSleep)) }}</span></template>
          <strong v-else class="stat-value muted">暂无记录</strong>
        </button>
      </section>

      <section class="today" aria-label="今日累计">
        <div><strong>{{ summary.milkMl }}</strong><span>奶量 ml</span></div>
        <div><strong>{{ summary.bottleCount + summary.breastCount }}</strong><span>喂奶次数</span></div>
        <div><strong>{{ fmtDuration(summary.sleepMin).replace('小时', '时').replace('分钟', '分') }}</strong><span>睡眠</span></div>
        <div><strong>{{ summary.poop }} / {{ summary.pee }}</strong><span>大便 / 小便</span></div>
      </section>
      <p v-if="summary.fever && summary.tempMax" class="temperature fever">最高体温 {{ summary.tempMax.toFixed(1) }}℃</p>

      <div class="section-title"><span>记录</span><button type="button" class="link" @click="voice = true"><AppIcon name="voice" :size="16" /> 语音</button></div>
      <section class="quick list-panel" aria-label="快捷记录">
        <button v-for="t in LOG_TYPES" :key="t" type="button" class="quick-btn" :data-kind="t" @click="record(t)">
          <span class="quick-icon"><AppIcon :name="t === 'sleep' && sleeping ? 'sun' : t" :size="23" /></span><span>{{ t === 'sleep' && sleeping ? '醒了' : LOG_KINDS[t].label }}</span>
        </button>
      </section>

      <div class="section-title"><span>今日计划</span><router-link class="link" to="/plan">查看 <van-icon name="arrow" size="11" /></router-link></div>
      <router-link v-if="planProgress.total" to="/plan" class="card plan"><PlanProgress v-for="item in progressItems" :key="item.label" :done="item.done" :total="item.planned" :label="item.label" :tone="item.tone" /></router-link>
      <router-link v-else :to="session.isAdmin ? '/plan/templates' : '/plan'" class="card empty-plan"><span>今天还没有安排</span><span class="template-link">{{ session.isAdmin ? '选择模板' : '查看计划' }} <van-icon name="arrow" size="11" /></span></router-link>

      <div class="section-title">家人留言</div>
      <div class="card"><NoteThread target-type="day" :target-id="today" :date="today" placeholder="留一句话给家人…" /></div>

      <div class="section-title"><span>最近记录</span><router-link class="link" to="/logs">全部 <van-icon name="arrow" size="11" /></router-link></div>
      <div class="card timeline"><LogItem v-for="log in recent" :key="log.id" :log="log" :notes="noteCount(log)" @open="open" /><van-empty v-if="!recent.length" image-size="56" description="今天还没有记录" /></div>
    </main>

    <LogSheet v-model:show="sheet" :type="sheetType" :log="sheetLog" />
    <VoiceSheet v-model:show="voice" />
    <van-action-sheet v-model:show="babySheet" :actions="babyActions" cancel-text="取消" close-on-click-action teleport="body" @select="(a: { id: string }) => session.switchBaby(a.id)" />
  </div>
</template>

<style scoped>
.home { background: var(--bc-surface); }
.hero { padding-top: calc(8px + env(safe-area-inset-top)); padding-bottom: 24px; }
.top { min-height: 36px; margin-bottom: 8px; }
.date-caption { font-size: 12px; color: var(--bc-text-3); }
.baby { width: 100%; gap: 12px; padding: 0; text-align: left; background: transparent; border: 0; cursor: pointer; }
.baby:disabled { opacity: 1; }
.avatar { display: grid; place-items: center; flex: none; width: 44px; height: 44px; border-radius: 50%; background: var(--bc-surface-2); color: var(--bc-text-2); font-size: 26px; }
.name { display: block; font-size: 21px; font-weight: 600; letter-spacing: -.4px; }
.sub { display: block; margin-top: 3px; color: var(--bc-text-3); font-size: 12px; }
.status { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; border: 0; border-radius: 0; background: transparent; }
.status > * + * { border: 0; }
.stat { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; min-width: 0; padding: 16px 14px; border: 0; border-radius: 14px; text-align: left; cursor: pointer; }
.stat-label { display: flex; align-items: center; gap: 5px; font-size: 12px; color: var(--bc-text-2); }
.stat-value { font-size: clamp(19px, 5.5vw, 24px); font-weight: 600; letter-spacing: -.5px; line-height: 1.3; font-variant-numeric: tabular-nums; }
.stat-sub { display: block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; color: var(--bc-text-2); }
.stat--milk { background: var(--bc-milk-soft); }
.stat--milk .stat-label > svg, .stat--milk .next { color: var(--bc-milk); }
.stat--sleep { background: var(--bc-sleep-soft); }
.stat--sleep .stat-label > svg, .stat--sleep .next { color: var(--bc-sleep); }
.next { font-size: 11px; }
.today { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); padding: 24px 0 20px; gap: 8px; border-bottom: 1px solid var(--bc-border); }
.today > div { display: flex; flex-direction: column; gap: 6px; text-align: center; }
.today > div + div { border-left: 1px solid var(--bc-border); }
.today strong { font-size: 16px; font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
.today span { color: var(--bc-text-3); font-size: 11px; }
.temperature { font-size: 12px; text-align: right; color: var(--bc-text-3); }
.fever { color: var(--bc-danger); }
.quick { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px 4px; padding: 0; overflow: visible; border: 0; border-radius: 0; }
.quick > * + * { border: 0; }
.quick-btn { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; min-height: 78px; padding: 4px; border: 0; border-radius: 12px; background: transparent; cursor: pointer; }
.quick-icon { display: grid; place-items: center; width: 42px; height: 42px; border-radius: 14px; background: var(--bc-surface-2); color: var(--bc-text-2); }
.quick-btn[data-kind=milk] .quick-icon { color: var(--bc-blue); background: var(--bc-blue-soft); }
.quick-btn[data-kind=solid] .quick-icon { color: var(--bc-milk); background: var(--bc-milk-soft); }
.quick-btn[data-kind=diaper] .quick-icon { color: var(--bc-diaper); background: var(--bc-diaper-soft); }
.quick-btn[data-kind=sleep] .quick-icon { color: var(--bc-sleep); background: var(--bc-sleep-soft); }
.quick-btn[data-kind=temp] .quick-icon { color: var(--bc-temp); background: var(--bc-temp-soft); }
.quick-btn[data-kind=medicine] .quick-icon { color: var(--bc-medicine); background: var(--bc-medicine-soft); }
.quick-btn[data-kind=growth] .quick-icon { color: var(--bc-growth); background: var(--bc-growth-soft); }
.quick-btn span:last-child { font-size: 12px; color: var(--bc-text-2); }
.quick-btn:active { background: var(--bc-surface-2); opacity: 1; }
.plan { display: flex; gap: 20px; color: inherit; text-decoration: none; background: var(--bc-bg); padding: 16px; border-radius: 12px; }
.empty-plan { display: flex; justify-content: space-between; align-items: center; color: var(--bc-text-2); font-size: 13px; text-decoration: none; background: var(--bc-bg); border-radius: 12px; }
.template-link { color: var(--bc-text); font-weight: 500; }
.timeline { padding: 0; }
.section-title { margin-top: 24px; margin-bottom: 12px; font-size: 16px; }
.section-title .link { color: var(--bc-text-3); font-size: 12px; }
.section-title + .card:has(.thread) { padding: 0; }
@media (max-width: 390px) { .stat { padding: 14px 12px; } .plan { gap: 12px; } }
</style>
