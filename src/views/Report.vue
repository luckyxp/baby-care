<!-- ==========================================================================
  每日汇报
  ----------------------------------------------------------------------------
  系统从日志 / 计划 / 打卡 / 留言实时汇总；已保存的汇报与实时数据合并展示：
  未改写的块随记录实时刷新，育儿嫂改写过的块原样保留。

    育儿嫂：逐块编辑 · 恢复自动 · 保存 · 一键复制 · 发布给家长（家长收到提醒）
    家　长：只读 · 一键复制 · 给育儿嫂留言
=========================================================================== -->
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { showConfirmDialog, showSuccessToast } from 'vant'
import { memberLabel } from '@/shared/constants'
import type { DateKey, ReportBlock } from '@/shared/types'
import { buildReport, mergeBlocks, renderReport } from '@/domain/report'
import { useSession } from '@/stores/session'
import { useAction } from '@/composables/useAction'
import { useClock } from '@/composables/useClock'
import { useDay } from '@/composables/useDay'
import { publishReport, reportIdOf, saveReport } from '@/services/report'
import { copyText } from '@/utils/clipboard'
import { ageOf, ageText, dayjs, hm, weekday } from '@/utils/time'
import DateBar from '@/components/DateBar.vue'
import NoteThread from '@/components/NoteThread.vue'
import CopyFallback from '@/components/report/CopyFallback.vue'
import ReportBlockCard from '@/components/report/ReportBlockCard.vue'

const route = useRoute()
const router = useRouter()
const session = useSession()
const { today, now } = useClock()
const { busy, run } = useAction()

/* ── 日期（与 ?date= 双向同步） ─────────────────────────────────────────── */

const isDateKey = (v: unknown): v is DateKey => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
const clampDate = (d: DateKey) => (d > today.value ? today.value : d)

const date = ref<DateKey>(isDateKey(route.query.date) ? clampDate(route.query.date) : today.value)

watch(
  () => route.query.date,
  (d) => {
    if (isDateKey(d) && clampDate(d) !== date.value) {
      date.value = clampDate(d)
    }
  },
)

/* ── 数据 ───────────────────────────────────────────────────────────────── */

const { logs, tasks, checkins, notes, report } = useDay(date)
const baby = computed(() => session.baby)

// 汇报留言本身不进入"家人留言"块，避免汇报引用自己
const dayNotes = computed(() => notes.value.filter((n) => n.targetType !== 'report'))

const live = computed<ReportBlock[]>(() =>
  baby.value
    ? buildReport({
        baby: baby.value,
        date: date.value,
        logs: logs.value,
        tasks: tasks.value,
        checkins: checkins.value,
        dayNotes: dayNotes.value,
        members: session.members,
        now: now.value,
      })
    : [],
)

/** 编辑中的工作副本；null 表示未编辑 */
const local = ref<ReportBlock[] | null>(null)
const editingKey = ref('')

const shown = computed<ReportBlock[]>(() => local.value ?? (report.value ? mergeBlocks(report.value.blocks, live.value) : live.value))
const visible = computed(() => shown.value.filter((b) => local.value || b.text.trim()))

watch(date, (d) => {
  local.value = null
  editingKey.value = ''
  if (route.query.date !== d) {
    void router.replace({ query: { ...route.query, date: d } })
  }
})

/* ── 状态 ───────────────────────────────────────────────────────────────── */

const nameOf = (userId: string | null) => {
  const m = userId ? session.memberOf(userId) : undefined
  return m ? memberLabel(m) : ''
}

const status = computed(() => {
  const r = report.value
  if (r?.publishedAt) {
    return { cls: 'pill--accent', text: `已发布 · ${hm(r.publishedAt)}${nameOf(r.publishedBy) ? ` · ${nameOf(r.publishedBy)}` : ''}` }
  }
  if (r) {
    return { cls: 'pill--primary', text: '已保存草稿' }
  }
  return { cls: '', text: '系统实时汇总' }
})

/** 发布之后又保存过修改（2 秒容差：发布本身会紧跟一次保存） */
const changedAfterPublish = computed(() => {
  const r = report.value
  return !!r?.publishedAt && r.updatedAt - r.publishedAt > 2000
})

const author = computed(() => {
  const publisher = nameOf(report.value?.publishedBy ?? null)
  if (publisher) {
    return publisher
  }
  const nanny = session.activeMembers.find((m) => m.role === 'admin')
  return nanny ? memberLabel(nanny) : ''
})

/* ── 编辑（仅育儿嫂） ───────────────────────────────────────────────────── */

const clone = (blocks: ReportBlock[]) => blocks.map((b) => ({ ...b }))

function startEdit(key: string) {
  local.value ??= clone(shown.value)
  editingKey.value = key
}

function input(key: string, text: string) {
  const block = local.value?.find((b) => b.key === key)
  if (block) {
    block.text = text
    block.edited = true
  }
}

function restore(key: string) {
  if (!local.value) {
    return
  }
  const fresh = live.value.find((b) => b.key === key)
  const i = local.value.findIndex((b) => b.key === key)
  if (fresh) {
    local.value.splice(i, 1, { ...fresh, edited: false })
  } else {
    local.value.splice(i, 1)
  }
}

function discard() {
  local.value = null
  editingKey.value = ''
}

async function save() {
  const b = baby.value
  if (!b) {
    return
  }
  const ok = await run(() => saveReport(b, date.value, shown.value), '已保存')
  if (ok) {
    discard()
  }
}

async function publish() {
  const b = baby.value
  if (!b) {
    return
  }
  const again = !!report.value?.publishedAt
  try {
    await showConfirmDialog({
      title: again ? '更新并重新发布' : '发布给家长',
      message: again ? '爸爸妈妈会再次收到汇报提醒，确定重新发布吗？' : '发布后爸爸妈妈会收到汇报提醒，确定发布吗？',
      confirmButtonText: '发布',
    })
  } catch {
    return
  }
  const ok = await run(() => publishReport(b, date.value, shown.value), again ? '已重新发布' : '已发布，家长会收到提醒')
  if (ok) {
    discard()
  }
}

/* ── 复制 ───────────────────────────────────────────────────────────────── */

const fallbackShow = ref(false)
const fallbackText = ref('')

async function copy() {
  const b = baby.value
  if (!b) {
    return
  }
  const text = renderReport(b, date.value, shown.value, author.value)
  if (await copyText(text)) {
    showSuccessToast({ message: '已复制，可粘贴到微信', duration: 1500 })
    return
  }
  fallbackText.value = text
  fallbackShow.value = true
}

onBeforeRouteLeave(async () => {
  if (!local.value) {
    return true
  }
  try {
    await showConfirmDialog({ title: '放弃修改？', message: '汇报有未保存的修改，离开后将丢失。', confirmButtonText: '放弃' })
    return true
  } catch {
    return false
  }
})
</script>

<template>
  <div class="page page--tab report-page">
    <header class="page-body head">
      <div class="row row--between">
        <h1 class="page-title">每日汇报</h1>
        <button class="link" type="button" @click="router.push('/report/history')">历史汇报 <van-icon name="arrow" /></button>
      </div>
      <DateBar v-model="date" />
    </header>

    <div class="page-body">
      <van-empty v-if="!baby" description="还没有宝宝档案" />

      <template v-else>
        <div class="card hero">
          <div class="row row--between">
            <div class="grow">
              <div class="baby">{{ baby.name }}的护理日报</div>
              <div class="muted">{{ dayjs(date).format('M月D日') }} {{ weekday(date) }} · {{ ageText(ageOf(baby.birthday, date)) }}</div>
            </div>
            <span class="pill" :class="status.cls">{{ status.text }}</span>
          </div>
          <div v-if="session.isAdmin && changedAfterPublish" class="hint pill pill--warn">发布后有修改，可重新发布提醒爸爸妈妈</div>
        </div>

        <van-notice-bar
          v-if="!session.isAdmin && !report?.publishedAt"
          class="notice"
          left-icon="info-o"
          wrapable
          :scrollable="false"
          text="育儿嫂尚未发布，以下为系统根据记录实时汇总的内容"
        />

        <div v-if="local" class="dirty row row--between">
          <span class="pill pill--warn">有未保存的修改</span>
          <button class="link" type="button" @click="discard">放弃修改</button>
        </div>

        <ReportBlockCard
          v-for="b in visible"
          :key="b.key"
          :block="b"
          :editable="session.isAdmin"
          :editing="editingKey === b.key"
          @edit="startEdit(b.key)"
          @done="editingKey = ''"
          @restore="restore(b.key)"
          @input="(t) => input(b.key, t)"
        />
        <van-empty v-if="!visible.length" image-size="80" description="这一天还没有记录" />

        <div class="section-title">汇报留言</div>
        <div class="card">
          <NoteThread
            target-type="report"
            :target-id="reportIdOf(baby.id, date)"
            :date="date"
            :placeholder="session.isAdmin ? '回复爸爸妈妈…' : '对今天的汇报有疑问或补充，留言给育儿嫂…'"
          />
        </div>
      </template>
    </div>

    <div v-if="baby" class="bar fixed-center">
      <template v-if="session.isAdmin">
        <van-button round plain :loading="busy" @click="save">保存</van-button>
        <van-button round plain type="primary" icon="description-o" @click="copy">复制</van-button>
        <van-button round type="primary" class="wide" :loading="busy" @click="publish">
          {{ report?.publishedAt ? '更新并重新发布' : '发布给家长' }}
        </van-button>
      </template>
      <van-button v-else round block type="primary" icon="description-o" @click="copy">一键复制汇报</van-button>
    </div>

    <CopyFallback v-model:show="fallbackShow" :text="fallbackText" />
  </div>
</template>

<style scoped>
.report-page {
  padding-bottom: calc(var(--bc-tabbar-h) + 72px + env(safe-area-inset-bottom));
}

.head {
  padding-top: calc(var(--sp-3) + env(safe-area-inset-top));
  padding-bottom: var(--sp-3);
}

.page-title {
  margin: 0 0 var(--sp-2);
  font-size: 22px;
}

.hero .baby {
  font-size: 17px;
  font-weight: 700;
}

.hint {
  margin-top: var(--sp-2);
}

.notice {
  margin-bottom: var(--sp-3);
  border-radius: var(--bc-radius);
}

.dirty {
  margin-bottom: var(--sp-2);
}

.bar {
  bottom: calc(var(--bc-tabbar-h) + env(safe-area-inset-bottom));
  z-index: 10;
  display: flex;
  gap: var(--sp-2);
  padding: var(--sp-2) var(--sp-4);
  background: var(--bc-surface);
  border-top: 1px solid var(--bc-border);
}

.bar .wide {
  flex: 1;
}
</style>
