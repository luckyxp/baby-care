<!-- ==========================================================================
  计划页：按具体日期安排喂养 / 早教 / 亲子任务，可从日模板库批量应用
  ----------------------------------------------------------------------------
    ┌ 日期条 ┐ ┌ 月龄方案 ┐ ┌ 进度指标 ×4 ┐
    ├ 喂养时间轴（记录日志即自动完成）
    ├ 日间早教（五大领域各一项）
    ├ 日间亲子
    └ 🌙 晚间亲子 · 留给爸爸妈妈
  路由参数：?date=YYYY-MM-DD&task=<id>（来自消息跳转时定位并展开任务）
=========================================================================== -->
<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showConfirmDialog } from 'vant'
import { EDU_KEYS } from '@/shared/constants'
import { can } from '@/shared/policy'
import type { CareLog, Checkin, DateKey, EduCategory, PlanTask, Slot, TaskKind } from '@/shared/types'
import { stageOf } from '@/library'
import { matchFeeding } from '@/domain/planner'
import { useSession } from '@/stores/session'
import { useAction } from '@/composables/useAction'
import { useClock } from '@/composables/useClock'
import { useDay } from '@/composables/useDay'
import type { LogInput } from '@/services/logs'
import {
  ensurePlan, feedingPreset, removeTask, swapTask, undoCheckin,
} from '@/services/plan'
import { ageOf, ageText, dayjs, shiftDate } from '@/utils/time'
import DateBar from '@/components/DateBar.vue'
import IconBadge from '@/components/IconBadge.vue'
import LogSheet from '@/components/LogSheet.vue'
import SyncStatus from '@/components/SyncStatus.vue'
import CheckinSheet from '@/components/plan/CheckinSheet.vue'
import FeedingTimeline from '@/components/plan/FeedingTimeline.vue'
import PlanProgress from '@/components/plan/PlanProgress.vue'
import StagePanel from '@/components/plan/StagePanel.vue'
import TaskCard from '@/components/plan/TaskCard.vue'
import TaskEditSheet from '@/components/plan/TaskEditSheet.vue'

const route = useRoute()
const router = useRouter()
const session = useSession()
const { today } = useClock()
const { run } = useAction()

/* ── 日期与数据 ─────────────────────────────────────────────────────────── */

const queryDate = () => {
  const d = route.query.date
  if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d) || dayjs(d).format('YYYY-MM-DD') !== d) {
    return ''
  }
  return d > shiftDate(today.value, 365) ? shiftDate(today.value, 365) : d
}
const date = ref<DateKey>(queryDate() || today.value)

watch(() => route.query.date, () => {
  const d = queryDate()
  if (d && d !== date.value) {
    date.value = d
  }
})
watch(date, (d) => {
  if (d !== queryDate()) {
    void router.replace({ query: { ...route.query, date: d, task: undefined } })
  }
})

const day = useDay(date)
const baby = computed(() => session.baby)
const age = computed(() => (baby.value ? ageOf(baby.value.birthday, date.value) : null))
const stage = computed(() => stageOf(age.value?.monthsFloat ?? 0))
const locked = computed(() => date.value > today.value)
const editing = ref(false)

watch(
  [() => baby.value?.id, date, () => session.isAdmin],
  () => {
    if (baby.value && session.isAdmin) {
      ensurePlan(baby.value, date.value)
        .catch((e) => console.error('[ensurePlan]', e))
    }
  },
  { immediate: true },
)

/* ── 分组与进度 ─────────────────────────────────────────────────────────── */

const byCategory = (a: PlanTask, b: PlanTask) =>
  EDU_KEYS.indexOf(a.category as EduCategory) - EDU_KEYS.indexOf(b.category as EduCategory) || a.order - b.order

const groups = computed(() => {
  const tasks = day.tasks.value
  return {
    feeding: tasks.filter((t) => t.kind === 'feeding').sort((a, b) => (a.time ?? '99').localeCompare(b.time ?? '99') || a.order - b.order),
    edu: tasks.filter((t) => t.kind === 'edu' && t.slot === 'day').sort(byCategory),
    day: tasks.filter((t) => t.kind === 'interaction' && t.slot === 'day'),
    evening: tasks.filter((t) => t.kind !== 'feeding' && t.slot === 'evening'),
  }
})

const matched = computed(() => matchFeeding(day.tasks.value, day.dayLogs.value))
const doneOf = (list: PlanTask[]) => list.filter((t) => day.checkinOf.value.has(t.id)).length

const progress = computed(() => [
  { key: 'feeding', label: '喂养', done: groups.value.feeding.filter((t) => matched.value.has(t.id)).length, total: groups.value.feeding.length },
  { key: 'edu', label: '早教', done: doneOf(groups.value.edu), total: groups.value.edu.length },
  { key: 'day', label: '日间亲子', done: doneOf(groups.value.day), total: groups.value.day.length },
  { key: 'evening', label: '晚间亲子', done: doneOf(groups.value.evening), total: groups.value.evening.length },
])

const empty = computed(() => !day.tasks.value.length)
const emptyText = computed(() => date.value < today.value ? '当天暂无计划' : '暂无安排')

/* ── 展开与定位 ─────────────────────────────────────────────────────────── */

const expanded = ref(new Set<string>())

function toggle(id: string) {
  const next = new Set(expanded.value)
  if (next.has(id)) {
    next.delete(id)
  } else {
    next.add(id)
  }
  expanded.value = next
}

watch(
  [() => route.query.task, () => day.tasks.value.length],
  async ([id]) => {
    if (typeof id !== 'string' || !day.tasks.value.some((t) => t.id === id)) {
      return
    }
    expanded.value = new Set([...expanded.value, id])
    await nextTick()
    document.getElementById(`task-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    void router.replace({ query: { ...route.query, task: undefined } })
  },
  { immediate: true },
)

/* ── 权限 ───────────────────────────────────────────────────────────────── */

const canCheckin = (t: PlanTask) => !!session.actor && can.checkin(session.actor, t)
const canUndo = (ck?: Checkin) => !!ck && !!session.actor && can.undoCheckin(session.actor, ck)
const noteCount = (t: PlanTask) => day.notesOf('task', t.id).length

/* ── 弹层状态 ───────────────────────────────────────────────────────────── */

const logShow = ref(false)
const logEdit = ref<CareLog | null>(null)
const logPreset = ref<Partial<LogInput> | null>(null)

const ckShow = ref(false)
const ckTask = ref<PlanTask | null>(null)

const editShow = ref(false)
const editTask = ref<PlanTask | null>(null)
const editDefaults = ref<{ kind: TaskKind; slot: Slot }>({ kind: 'edu', slot: 'day' })

function record(t: PlanTask) {
  logEdit.value = null
  logPreset.value = feedingPreset(t)
  logShow.value = true
}

function openLog(log: CareLog) {
  logPreset.value = null
  logEdit.value = log
  logShow.value = true
}

function openCheckin(t: PlanTask) {
  ckTask.value = t
  ckShow.value = true
}

function openEdit(t: PlanTask | null, defaults?: { kind: TaskKind; slot: Slot }) {
  editTask.value = t
  if (defaults) {
    editDefaults.value = defaults
  }
  editShow.value = true
}

/* ── 操作 ───────────────────────────────────────────────────────────────── */

async function undo(ck?: Checkin) {
  if (!ck) {
    return
  }
  const confirmed = await showConfirmDialog({ title: '撤销打卡', message: '撤销后可以重新打卡，确定吗？' }).then(() => true).catch(() => false)
  if (!confirmed) {
    return
  }
  await run(() => undoCheckin(ck), '已撤销')
}

function swap(t: PlanTask) {
  const taken = new Set(day.tasks.value.map((x) => x.sourceId).filter((x): x is string => !!x))
  void run(() => swapTask(t, age.value?.monthsFloat ?? 0, taken), '已换成新活动')
}

async function drop(t: PlanTask) {
  const confirmed = await showConfirmDialog({ title: '删除任务', message: `确定删除「${t.title}」吗？` }).then(() => true).catch(() => false)
  if (!confirmed) {
    return
  }
  await run(() => removeTask(t), '已删除')
}

function toLibrary(slot: Slot) {
  void router.push({ path: '/library', query: { pick: '1', date: date.value, slot } })
}

function toTemplates(fromCurrent = false) {
  void router.push({ path: '/plan/templates', query: { date: date.value, ...(fromCurrent ? { edit: 'new', from: 'current' } : {}) } })
}
</script>

<template>
  <div class="page page--tab">
    <header class="plan-head page-body">
      <div class="row row--between top">
        <div>
          <h1 class="h1">每日计划 <small>{{ baby?.name }}</small></h1>
        </div>
        <div class="row">
          <SyncStatus />
        </div>
      </div>
      <DateBar v-model="date" :min="baby?.birthday" :max="shiftDate(today, 365)" />
    </header>

    <main class="page-body">
      <div class="toolbar row row--between">
        <div class="row toolbar-links">
          <button type="button" class="link row" @click="router.push('/library')"><van-icon name="bookmark-o" /> 素材库</button>
          <button v-if="session.isAdmin" type="button" class="link row" @click="toTemplates()"><van-icon name="description-o" /> 日模板库</button>
        </div>
        <div v-if="session.isAdmin" class="row">
          <button v-if="editing && !empty" type="button" class="link" @click="toTemplates(true)">存为日模板</button>
          <van-button size="small" round :type="editing ? 'primary' : 'default'" @click="editing = !editing">
            {{ editing ? '完成' : '调整计划' }}
          </van-button>
        </div>
      </div>

      <template v-if="empty && !editing">
        <van-empty image-size="64" :description="emptyText" />
        <div v-if="session.isAdmin" class="empty-actions"><van-button type="primary" @click="toTemplates()">从模板安排</van-button></div>
      </template>

      <template v-else>
        <div class="card progress-strip">
          <PlanProgress v-for="p in progress" :key="p.key" :done="p.done" :total="p.total" :label="p.label" :tone="p.key" variant="ring" />
        </div>

        <!-- 喂养 -->
        <div class="section-title">
          <span class="section-label"><IconBadge name="milk" tone="feeding" size="sm" />喂养 <small class="muted">{{ groups.feeding.length }} 项</small></span>
          <button v-if="editing" type="button" class="link" @click="openEdit(null, { kind: 'feeding', slot: 'day' })">+ 添加</button>
        </div>
        <FeedingTimeline
          v-if="groups.feeding.length"
          :tasks="groups.feeding" :matched="matched" :editing="editing" :can-record="true" :locked="locked"
          @record="record" @open="openLog" @edit="(t) => openEdit(t)" @remove="drop"
        />
        <p v-else class="muted empty-line">暂无喂养安排</p>
        <button v-if="editing" type="button" class="add-btn" @click="router.push({ path: '/library', query: { pick: '1', date, slot: 'day', tab: 'feeding' } })">
          + 从食谱库添加辅食
        </button>

        <!-- 日间早教 -->
        <div class="section-title"><span class="section-label"><IconBadge name="gross" tone="edu" size="sm" />早教 <small class="muted">{{ groups.edu.length }} 项</small></span></div>
        <section v-if="groups.edu.length" class="list-panel"><TaskCard
          v-for="t in groups.edu" :key="t.id" :task="t" :checkin="day.checkinOf.value.get(t.id)"
          :expanded="expanded.has(t.id)" :editing="editing" :can-checkin="canCheckin(t)" :can-undo="canUndo(day.checkinOf.value.get(t.id))"
          :locked="locked" :notes="noteCount(t)"
          @toggle="toggle(t.id)" @checkin="openCheckin(t)" @undo="undo(day.checkinOf.value.get(t.id))"
          @swap="swap(t)" @edit="openEdit(t)" @remove="drop(t)"
        /></section>
        <p v-if="!groups.edu.length" class="muted empty-line">暂无早教任务</p>
        <div v-if="editing" class="add-row">
          <button type="button" class="add-btn" @click="toLibrary('day')">+ 从素材库添加</button>
          <button type="button" class="add-btn" @click="openEdit(null, { kind: 'edu', slot: 'day' })">+ 自定义任务</button>
        </div>

        <!-- 日间亲子 -->
        <div class="section-title"><span class="section-label"><IconBadge name="sun" tone="day" size="sm" />日间亲子</span></div>
        <section v-if="groups.day.length" class="list-panel"><TaskCard
          v-for="t in groups.day" :key="t.id" :task="t" :checkin="day.checkinOf.value.get(t.id)"
          :expanded="expanded.has(t.id)" :editing="editing" :can-checkin="canCheckin(t)" :can-undo="canUndo(day.checkinOf.value.get(t.id))"
          :locked="locked" :notes="noteCount(t)"
          @toggle="toggle(t.id)" @checkin="openCheckin(t)" @undo="undo(day.checkinOf.value.get(t.id))"
          @swap="swap(t)" @edit="openEdit(t)" @remove="drop(t)"
        /></section>
        <p v-if="!groups.day.length" class="muted empty-line">暂无日间亲子任务</p>
        <div v-if="editing" class="add-row">
          <button type="button" class="add-btn" @click="toLibrary('day')">+ 从素材库添加</button>
          <button type="button" class="add-btn" @click="openEdit(null, { kind: 'interaction', slot: 'day' })">+ 自定义任务</button>
        </div>

        <!-- 晚间亲子 -->
        <section class="evening">
          <div class="section-title evening-title">
            <span class="section-label"><IconBadge name="moon" tone="social" size="sm" />晚间亲子</span><small class="muted">爸爸妈妈</small>
          </div>
          <div v-if="groups.evening.length" class="list-panel"><TaskCard
            v-for="t in groups.evening" :key="t.id" :task="t" :checkin="day.checkinOf.value.get(t.id)"
            :expanded="expanded.has(t.id)" :editing="editing" :can-checkin="canCheckin(t)" :can-undo="canUndo(day.checkinOf.value.get(t.id))"
            :locked="locked" :notes="noteCount(t)"
            @toggle="toggle(t.id)" @checkin="openCheckin(t)" @undo="undo(day.checkinOf.value.get(t.id))"
            @swap="swap(t)" @edit="openEdit(t)" @remove="drop(t)"
          /></div>
          <p v-if="!groups.evening.length" class="evening-sub">暂无晚间任务</p>
          <div v-if="editing" class="add-row">
            <button type="button" class="add-btn add-btn--night" @click="toLibrary('evening')">+ 从素材库添加</button>
            <button type="button" class="add-btn add-btn--night" @click="openEdit(null, { kind: 'interaction', slot: 'evening' })">+ 自定义任务</button>
          </div>
        </section>
      </template>
      <StagePanel v-if="age" class="stage-reference" :stage="stage" :age-text="ageText(age)" />
    </main>

    <LogSheet v-model:show="logShow" :log="logEdit" :preset="logPreset" />
    <CheckinSheet v-model:show="ckShow" :task="ckTask" />
    <TaskEditSheet v-if="baby" v-model:show="editShow" :task="editTask" :baby="baby" :date="date" :defaults="editDefaults" />
  </div>
</template>

<style scoped>
.plan-head { padding-top: calc(20px + env(safe-area-inset-top)); padding-bottom: 8px; }
.top { margin-bottom: 8px; min-height: 44px; }
.h1 { margin: 0; font-size: 22px; font-weight: 600; letter-spacing: -.5px; }
.h1 small { display: inline-block; margin-left: 8px; color: var(--bc-text-3); font-size: 12px; font-weight: 400; letter-spacing: 0; }
.toolbar { flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
.toolbar .link { font-size: 13px; }
.toolbar-links { gap: 16px; }
.progress-strip { display: flex; gap: 12px; padding: 20px 12px 16px; }
.section-label { display: inline-flex; align-items: center; gap: 8px; }
.section-title small { margin-left: 0; font-size: 12px; font-weight: 400; }
.empty-line, .evening-sub { font-size: 13px; color: var(--bc-text-3); margin: 0 0 12px; }
.add-row { display: flex; gap: 8px; margin-top: 8px; }
.add-btn { flex: 1; width: 100%; min-height: 44px; margin: 8px 0; border: 1px solid var(--bc-border); border-radius: 8px; background: transparent; color: var(--bc-primary); cursor: pointer; font-size: 13px; }
.evening { margin-top: 24px; }
.stage-reference { margin-top: 28px; }
.empty-actions { display: flex; justify-content: center; margin: 0 0 32px; }
@media (max-width: 390px) { .progress-strip { gap: 12px; } .toolbar-links { gap: 12px; } }
</style>
