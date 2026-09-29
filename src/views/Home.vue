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
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { showConfirmDialog } from 'vant'
import { LOG_KINDS, LOG_TYPES, RELATION_LABEL } from '@/shared/constants'
import type { CareLog, LogType } from '@/shared/types'
import { isSleeping, sleepMinutes, summarizeLog } from '@/domain/log-kinds'
import { matchFeeding } from '@/domain/planner'
import { percent, summarizeDay, summarizeEdu } from '@/domain/stats'
import { stageOf } from '@/library'
import { db } from '@/db/client'
import { useLive } from '@/db/live'
import LogItem from '@/components/LogItem.vue'
import LogSheet from '@/components/LogSheet.vue'
import NoteThread from '@/components/NoteThread.vue'
import SyncStatus from '@/components/SyncStatus.vue'
import VoiceSheet from '@/components/VoiceSheet.vue'
import { useAction } from '@/composables/useAction'
import { useClock } from '@/composables/useClock'
import { useDay } from '@/composables/useDay'
import { useNotices } from '@/composables/useNotices'
import { ensurePlan } from '@/services/plan'
import { wakeUp } from '@/services/logs'
import { useSession } from '@/stores/session'
import { ageOf, ageText, atTime, elapsed, fmtDuration, hm } from '@/utils/time'

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

// 育儿嫂打开首页时顺手生成今天的计划（幂等）
watch(
  [baby, today, () => session.isAdmin],
  ([b, d, admin]) => {
    if (b && admin) {
      void ensurePlan(b, d)
    }
  },
  { immediate: true },
)

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
    <!-- ── 宝宝卡 ── -->
    <header class="hero">
      <div class="row row--between top">
        <SyncStatus />
        <button class="bell" type="button" aria-label="消息" @click="router.push('/notices')">
          <van-badge :content="unread || undefined" max="99"><van-icon name="bell" size="22" /></van-badge>
        </button>
      </div>
      <div v-if="baby" class="baby row" @click="babySheet = session.babies.length > 1">
        <div class="avatar">{{ baby.gender === 'girl' ? '👧' : '👦' }}</div>
        <div class="grow">
          <div class="name">
            {{ baby.name }}
            <van-icon v-if="session.babies.length > 1" name="exchange" size="14" />
          </div>
          <div class="sub">{{ age && ageText(age) }} · {{ stage?.title }}</div>
        </div>
        <span class="pill role">{{ session.member ? RELATION_LABEL[session.member.relation] : '' }}{{ session.isAdmin ? ' · 管理员' : '' }}</span>
      </div>
    </header>

    <div class="page-body">
      <!-- ── 状态卡 ── -->
      <section class="status">
        <div class="stat card" @click="record('milk')">
          <div class="stat-label">🍼 距上次喂奶</div>
          <template v-if="lastMilk">
            <div class="stat-value">{{ elapsed(lastMilk.time, now) }}</div>
            <div class="stat-sub ellipsis">{{ hm(lastMilk.time) }} {{ summarizeLog(lastMilk) }}</div>
          </template>
          <div v-else class="stat-value muted">暂无</div>
          <div v-if="nextFeed" class="pill pill--primary next">下一顿 {{ nextFeed.time }}{{ nextFeed.amount ? ` · ${nextFeed.amount}ml` : '' }}</div>
        </div>

        <div class="stat card" :class="{ 'stat--sleep': sleeping }" @click="sleeping ? wake() : record('sleep')">
          <div class="stat-label">😴 {{ sleeping ? '正在睡' : '已醒' }}</div>
          <template v-if="sleeping">
            <div class="stat-value">{{ fmtDuration(sleepMinutes(sleeping, now)) }}</div>
            <div class="stat-sub">{{ hm(sleeping.time) }} 入睡</div>
            <div class="pill pill--primary next">点这里记录醒来</div>
          </template>
          <template v-else-if="lastSleep?.endTime">
            <div class="stat-value">{{ elapsed(lastSleep.endTime, now) }}</div>
            <div class="stat-sub">上一觉 {{ fmtDuration(sleepMinutes(lastSleep)) }}</div>
          </template>
          <div v-else class="stat-value muted">暂无</div>
        </div>
      </section>

      <div class="card today">
        <div class="today-item"><b>{{ summary.milkMl }}</b><span>奶量 ml</span></div>
        <div class="today-item"><b>{{ summary.bottleCount + summary.breastCount }}</b><span>喂奶次</span></div>
        <div class="today-item"><b>{{ fmtDuration(summary.sleepMin).replace('分钟', '分') }}</b><span>睡眠</span></div>
        <div class="today-item"><b>{{ summary.poop }}/{{ summary.pee }}</b><span>大/小便</span></div>
        <div v-if="summary.tempMax" class="today-item" :class="{ fever: summary.fever }"><b>{{ summary.tempMax.toFixed(1) }}</b><span>最高℃</span></div>
      </div>

      <!-- ── 快捷记录 ── -->
      <div class="section-title">快捷记录</div>
      <section class="quick">
        <button v-for="t in LOG_TYPES" :key="t" type="button" class="quick-btn" @click="record(t)">
          <span class="quick-icon" :style="{ background: LOG_KINDS[t].color + '22' }">{{ t === 'sleep' && sleeping ? '⏰' : LOG_KINDS[t].icon }}</span>
          <span>{{ t === 'sleep' && sleeping ? '醒了' : LOG_KINDS[t].label }}</span>
        </button>
      </section>
      <van-button class="voice" round block icon="volume-o" type="primary" plain @click="voice = true">
        说一句话记录（如「三点喝了150毫升奶」）
      </van-button>

      <!-- ── 今日计划 ── -->
      <div class="section-title">
        今日计划
        <router-link class="link" to="/plan">查看 ›</router-link>
      </div>
      <router-link v-if="planProgress.total" to="/plan" class="card plan">
        <div class="plan-item">
          <van-circle :current-rate="percent(planProgress.feeding)" :rate="percent(planProgress.feeding)" size="52px" :stroke-width="80" color="#5AA9F8" :text="`${planProgress.feeding.done}/${planProgress.feeding.planned}`" />
          <span>喂养</span>
        </div>
        <div class="plan-item">
          <van-circle :current-rate="percent(planProgress.edu)" :rate="percent(planProgress.edu)" size="52px" :stroke-width="80" color="#FF8A65" :text="`${planProgress.edu.done}/${planProgress.edu.planned}`" />
          <span>早教</span>
        </div>
        <div class="plan-item">
          <van-circle :current-rate="percent(planProgress.day)" :rate="percent(planProgress.day)" size="52px" :stroke-width="80" color="#2FB893" :text="`${planProgress.day.done}/${planProgress.day.planned}`" />
          <span>日间亲子</span>
        </div>
        <div class="plan-item">
          <van-circle :current-rate="percent(planProgress.evening)" :rate="percent(planProgress.evening)" size="52px" :stroke-width="80" color="#8E7CF3" :text="`${planProgress.evening.done}/${planProgress.evening.planned}`" />
          <span>🌙 晚间亲子</span>
        </div>
      </router-link>
      <div v-else class="card muted empty-plan">
        {{ session.isAdmin ? '正在根据月龄生成今日计划…' : '育儿嫂还没有生成今天的计划' }}
      </div>

      <!-- ── 留言板 ── -->
      <div class="section-title">家人留言 <small class="muted">交接事项、特别叮嘱</small></div>
      <div class="card">
        <NoteThread target-type="day" :target-id="today" :date="today" placeholder="如：下午带宝宝去打疫苗，记得带本子" />
      </div>

      <!-- ── 最近记录 ── -->
      <div class="section-title">
        今天的记录
        <router-link class="link" to="/logs">全部 ›</router-link>
      </div>
      <div class="card timeline">
        <LogItem v-for="log in recent" :key="log.id" :log="log" :notes="noteCount(log)" @open="open" />
        <van-empty v-if="!recent.length" image-size="72" description="今天还没有记录，点上方按钮开始吧" />
      </div>
    </div>

    <LogSheet v-model:show="sheet" :type="sheetType" :log="sheetLog" />
    <VoiceSheet v-model:show="voice" />
    <van-action-sheet
      v-model:show="babySheet"
      :actions="babyActions"
      cancel-text="取消"
      close-on-click-action
      teleport="body"
      @select="(a: { id: string }) => session.switchBaby(a.id)"
    />
  </div>
</template>

<style scoped>
.hero {
  padding: calc(var(--sp-3) + env(safe-area-inset-top)) var(--sp-4) var(--sp-4);
  background: linear-gradient(160deg, var(--bc-primary-soft) 0%, var(--bc-bg) 100%);
}

.top {
  margin-bottom: var(--sp-3);
}

.bell {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border: 0;
  border-radius: 50%;
  background: var(--bc-surface);
  color: var(--bc-text);
  box-shadow: var(--bc-shadow);
  cursor: pointer;
}

.baby {
  gap: var(--sp-3);
}

.avatar {
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--bc-surface);
  font-size: 32px;
  box-shadow: var(--bc-shadow);
}

.name {
  font-size: 20px;
  font-weight: 700;
}

.sub {
  color: var(--bc-text-2);
}

.role {
  background: var(--bc-surface);
}

.status {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--sp-3);
}

.stat {
  margin: 0;
  cursor: pointer;
  min-height: 132px;
}

.stat--sleep {
  background: linear-gradient(160deg, #3d3670, #5b4fa8);
  color: #fff;
}

.stat--sleep .stat-label,
.stat--sleep .stat-sub {
  color: rgba(255, 255, 255, 0.8);
}

.stat-label {
  font-size: 13px;
  color: var(--bc-text-2);
}

.stat-value {
  margin: 6px 0 2px;
  font-size: 22px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.stat-sub {
  font-size: 12px;
  color: var(--bc-text-3);
}

.next {
  margin-top: var(--sp-2);
}

.today {
  display: flex;
  justify-content: space-around;
  margin-top: var(--sp-3);
  padding: var(--sp-3) var(--sp-2);
}

.today-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.today-item b {
  font-size: 17px;
  font-variant-numeric: tabular-nums;
}

.today-item span {
  font-size: 11px;
  color: var(--bc-text-3);
}

.fever b {
  color: var(--bc-danger);
}

.quick {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--sp-2);
}

.quick-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: var(--sp-3) 0;
  border: 0;
  border-radius: var(--bc-radius);
  background: var(--bc-surface);
  box-shadow: var(--bc-shadow);
  font-size: 13px;
  cursor: pointer;
  transition: transform 0.1s ease;
}

.quick-btn:active {
  transform: scale(0.95);
}

.quick-icon {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 14px;
  font-size: 24px;
}

.voice {
  margin-top: var(--sp-3);
}

.plan {
  display: flex;
  justify-content: space-around;
  color: inherit;
  text-decoration: none;
}

.plan-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--bc-text-2);
}

.empty-plan {
  text-align: center;
}

.section-title small {
  font-weight: 400;
  font-size: 12px;
}

.timeline {
  padding-top: var(--sp-1);
  padding-bottom: var(--sp-1);
}

</style>
