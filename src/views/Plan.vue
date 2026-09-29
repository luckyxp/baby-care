<!-- ==========================================================================
  计划页：系统按月龄自动生成每日喂养 / 早教 / 亲子任务，育儿嫂可调整，完成后打卡
  ----------------------------------------------------------------------------
    ┌ 日期条 ┐ ┌ 月龄方案 ┐ ┌ 进度环 ×4 ┐
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
  ensurePlan, feedingPreset, regenerate, removeTask, resetFeeding, saveAsDefaultSchedule, swapTask, undoCheckin,
} from '@/services/plan'
import { ageOf, ageText, dayjs, shiftDate } from '@/utils/time'
import DateBar from '@/components/DateBar.vue'
import LogSheet from '@/components/LogSheet.vue'
import SyncStatus from '@/components/SyncStatus.vue'
import CheckinSheet from '@/components/plan/CheckinSheet.vue'
import FeedingTimeline from '@/components/plan/FeedingTimeline.vue'
import ProgressRing from '@/components/plan/ProgressRing.vue'
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
  return d > shiftDate(today.value, 7) ? shiftDate(today.value, 7) : d
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
      ensurePlan(baby.value, date.value).catch((e) => console.error('[ensurePlan]', e))
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
  { key: 'feeding', label: '喂养', icon: '🍼', color: '#5AA9F8', done: groups.value.feeding.filter((t) => matched.value.has(t.id)).length, total: groups.value.feeding.length },
  { key: 'edu', label: '早教', icon: '🎯', color: '#FF8A65', done: doneOf(groups.value.edu), total: groups.value.edu.length },
  { key: 'day', label: '日间亲子', icon: '☀️', color: '#F5A623', done: doneOf(groups.value.day), total: groups.value.day.length },
  { key: 'evening', label: '晚间亲子', icon: '🌙', color: '#8E7CF3', done: doneOf(groups.value.evening), total: groups.value.evening.length },
])

const empty = computed(() => !day.tasks.value.length)
const emptyText = computed(() => {
  if (day.plan.value) {
    return session.isAdmin ? '当天暂无任务，点击调整计划添加' : '当天暂无任务'
  }
  if (date.value < today.value) {
    return '当天没有计划'
  }
  return session.isAdmin ? '正在按月龄生成计划…' : '育儿嫂还没有生成这天的计划'
})

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

const moreShow = ref(false)

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

const MORE_ACTIONS = [
  { name: '换一批早教与亲子', subname: '保留已打卡的任务', key: 'regen' },
  { name: '保存喂养作息为默认', subname: '以后每天按当前时点生成', key: 'save' },
  { name: '恢复默认喂养作息', subname: '重建当天未完成的喂养任务', key: 'reset' },
]

async function onMore(action: { key: string }) {
  moreShow.value = false
  const b = baby.value
  if (!b) {
    return
  }
  if (action.key === 'regen') {
    await run(() => regenerate(b, date.value), '已换一批')
  } else if (action.key === 'save') {
    await run(() => saveAsDefaultSchedule(b, day.tasks.value), '已保存为默认作息')
  } else if (action.key === 'reset') {
    const confirmed = await showConfirmDialog({ title: '恢复默认作息', message: '未完成的喂养任务会按默认作息重新生成，确定吗？' }).then(() => true).catch(() => false)
    if (!confirmed) {
      return
    }
    await run(() => resetFeeding(b, date.value), '已恢复')
  }
}
</script>

<template>
  <div class="page page--tab">
    <header class="plan-head page-body">
      <div class="row row--between top">
        <div>
          <h1 class="h1">每日计划</h1>
          <div class="muted">{{ baby?.name }} · 系统按月龄自动匹配</div>
        </div>
        <div class="row">
          <SyncStatus />
        </div>
      </div>
      <DateBar v-model="date" :min="baby?.birthday" :max="shiftDate(today, 7)" />
    </header>

    <main class="page-body">
      <StagePanel v-if="age" :stage="stage" :age-text="ageText(age)" />

      <div v-if="!session.isAdmin" class="card card--flat tip">
        💡 计划由育儿嫂制定。晚间亲子任务留给爸爸妈妈，完成后可以打卡；每个任务都能补充备注。
      </div>

      <div class="toolbar row row--between">
        <button type="button" class="link row" @click="router.push('/library')"><van-icon name="bookmark-o" /> 素材库</button>
        <div v-if="session.isAdmin" class="row">
          <button v-if="editing" type="button" class="link" @click="moreShow = true">批量调整</button>
          <van-button size="small" round :type="editing ? 'primary' : 'default'" @click="editing = !editing">
            {{ editing ? '完成' : '调整计划' }}
          </van-button>
        </div>
      </div>

      <van-empty v-if="empty && !editing" image-size="80" :description="emptyText" />

      <template v-else>
        <div class="card rings">
          <ProgressRing v-for="p in progress" :key="p.key" :done="p.done" :total="p.total" :label="p.label" :icon="p.icon" :color="p.color" />
        </div>

        <p v-if="locked" class="muted future-note">这是未来计划，可以提前调整，到当天再记录与打卡。</p>
        <!-- 喂养 -->
        <div class="section-title">
          <span>🍼 喂养安排 <small class="muted">记录即完成</small></span>
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
        <div class="section-title"><span>🎯 日间早教 <small class="muted">五大领域</small></span></div>
        <TaskCard
          v-for="t in groups.edu" :key="t.id" :task="t" :checkin="day.checkinOf.value.get(t.id)"
          :expanded="expanded.has(t.id)" :editing="editing" :can-checkin="canCheckin(t)" :can-undo="canUndo(day.checkinOf.value.get(t.id))"
          :locked="locked" :notes="noteCount(t)"
          @toggle="toggle(t.id)" @checkin="openCheckin(t)" @undo="undo(day.checkinOf.value.get(t.id))"
          @swap="swap(t)" @edit="openEdit(t)" @remove="drop(t)"
        />
        <p v-if="!groups.edu.length" class="muted empty-line">暂无早教任务</p>
        <div v-if="editing" class="add-row">
          <button type="button" class="add-btn" @click="toLibrary('day')">+ 从素材库添加</button>
          <button type="button" class="add-btn" @click="openEdit(null, { kind: 'edu', slot: 'day' })">+ 自定义任务</button>
        </div>

        <!-- 日间亲子 -->
        <div class="section-title"><span>☀️ 日间亲子互动</span></div>
        <TaskCard
          v-for="t in groups.day" :key="t.id" :task="t" :checkin="day.checkinOf.value.get(t.id)"
          :expanded="expanded.has(t.id)" :editing="editing" :can-checkin="canCheckin(t)" :can-undo="canUndo(day.checkinOf.value.get(t.id))"
          :locked="locked" :notes="noteCount(t)"
          @toggle="toggle(t.id)" @checkin="openCheckin(t)" @undo="undo(day.checkinOf.value.get(t.id))"
          @swap="swap(t)" @edit="openEdit(t)" @remove="drop(t)"
        />
        <p v-if="!groups.day.length" class="muted empty-line">暂无日间亲子任务</p>
        <div v-if="editing" class="add-row">
          <button type="button" class="add-btn" @click="toLibrary('day')">+ 从素材库添加</button>
          <button type="button" class="add-btn" @click="openEdit(null, { kind: 'interaction', slot: 'day' })">+ 自定义任务</button>
        </div>

        <!-- 晚间亲子 -->
        <section class="evening">
          <div class="section-title evening-title">
            <span>🌙 晚间亲子 · 留给爸爸妈妈</span>
          </div>
          <p class="evening-sub">白天的陪伴交给育儿嫂，睡前这段专属时光留给你们 💞</p>
          <TaskCard
            v-for="t in groups.evening" :key="t.id" :task="t" :checkin="day.checkinOf.value.get(t.id)"
            :expanded="expanded.has(t.id)" :editing="editing" :can-checkin="canCheckin(t)" :can-undo="canUndo(day.checkinOf.value.get(t.id))"
            :locked="locked" :notes="noteCount(t)"
            @toggle="toggle(t.id)" @checkin="openCheckin(t)" @undo="undo(day.checkinOf.value.get(t.id))"
            @swap="swap(t)" @edit="openEdit(t)" @remove="drop(t)"
          />
          <p v-if="!groups.evening.length" class="evening-sub">暂无晚间任务</p>
          <div v-if="editing" class="add-row">
            <button type="button" class="add-btn add-btn--night" @click="toLibrary('evening')">+ 从素材库添加</button>
            <button type="button" class="add-btn add-btn--night" @click="openEdit(null, { kind: 'interaction', slot: 'evening' })">+ 自定义任务</button>
          </div>
        </section>
      </template>
    </main>

    <LogSheet v-model:show="logShow" :log="logEdit" :preset="logPreset" />
    <CheckinSheet v-model:show="ckShow" :task="ckTask" />
    <TaskEditSheet v-if="baby" v-model:show="editShow" :task="editTask" :baby="baby" :date="date" :defaults="editDefaults" />
    <van-action-sheet v-model:show="moreShow" :actions="MORE_ACTIONS" cancel-text="取消" teleport="body" @select="onMore" />
  </div>
</template>

<style scoped>
.plan-head {
  padding-top: calc(var(--sp-4) + env(safe-area-inset-top));
  padding-bottom: var(--sp-3);
}

.top {
  margin-bottom: var(--sp-3);
}

.h1 {
  margin: 0;
  font-size: 22px;
}

.tip {
  font-size: 13px;
  color: var(--bc-text-2);
  background: var(--bc-warn-soft);
  border: 0;
}

.toolbar {
  margin: var(--sp-2) 0 var(--sp-3);
  min-height: 36px;
}

.toolbar .link {
  gap: 4px;
  font-size: 14px;
}

.rings {
  display: flex;
  justify-content: space-between;
  gap: var(--sp-1);
  padding: var(--sp-3) var(--sp-2);
}

.section-title small {
  font-size: 12px;
  font-weight: 400;
}

.empty-line {
  margin: 0 var(--sp-1) var(--sp-2);
  font-size: 13px;
}

.add-row {
  display: flex;
  gap: var(--sp-2);
}

.add-btn {
  flex: 1;
  min-height: 40px;
  margin-bottom: var(--sp-2);
  border: 1px dashed var(--bc-primary);
  border-radius: var(--bc-radius);
  background: transparent;
  color: var(--bc-primary);
  cursor: pointer;
  width: 100%;
}

.evening {
  margin-top: var(--sp-5);
  padding: var(--sp-1) var(--sp-3) var(--sp-3);
  border-radius: var(--bc-radius-lg);
  background: linear-gradient(180deg, #1f1c3d, #2b2652);
}

.evening-title {
  color: #f1eefe;
}

.evening-sub {
  margin: 0 var(--sp-1) var(--sp-3);
  font-size: 12px;
  color: #bdb5ee;
}

.add-btn--night {
  border-color: #bdb5ee;
  color: #e4dfff;
}
</style>
