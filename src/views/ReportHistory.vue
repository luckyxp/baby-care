<!-- ==========================================================================
  历史汇报：最近 60 天，按月分组
  ----------------------------------------------------------------------------
  · 保存过的汇报：显示发布状态 + 小结首句
  · 未保存但有记录的日子：标"自动汇总"，点进去由系统实时生成
=========================================================================== -->
<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import type { CareLog, DateKey, Report } from '@/shared/types'
import { summarizeDay } from '@/domain/stats'
import { db } from '@/db/client'
import { useLive } from '@/db/live'
import { useSession } from '@/stores/session'
import { useClock } from '@/composables/useClock'
import { dateLabel, dayjs, fmtDuration, shiftDate } from '@/utils/time'
import PageNav from '@/components/PageNav.vue'

type Status = 'published' | 'draft' | 'auto'

interface HistoryItem {
  date: DateKey
  status: Status
  excerpt: string
  stats: string
  count: number
}

const DAYS = 60
const STATUS_VIEW: Record<Status, { cls: string; text: string }> = {
  published: { cls: 'pill--accent', text: '已发布' },
  draft: { cls: 'pill--primary', text: '草稿' },
  auto: { cls: '', text: '自动汇总' },
}

const router = useRouter()
const session = useSession()
const { today } = useClock()

const start = computed(() => shiftDate(today.value, -(DAYS - 1)))

/** 小结块首行；没有小结时取第一个非空块 */
function excerptOf(r: Report): string {
  const block = r.blocks.find((b) => b.key === 'summary' && b.text.trim()) ?? r.blocks.find((b) => b.text.trim())
  return block ? block.text.trim().split('\n')[0] : ''
}

function statsOf(date: DateKey, logs: CareLog[]): string {
  const s = summarizeDay(date, logs)
  return [
    s.milkMl ? `奶 ${s.milkMl}ml` : s.breastCount ? `亲喂 ${s.breastCount}次` : '',
    s.solidCount ? `辅食 ${s.solidCount}次` : '',
    s.sleepMin ? `睡 ${fmtDuration(s.sleepMin)}` : '',
    s.poop ? `便 ${s.poop}次` : '',
  ].filter(Boolean).join(' · ')
}

const items = useLive(
  async () => {
    const id = session.baby?.id
    if (!id) {
      return [] as HistoryItem[]
    }
    const [reports, logs] = await Promise.all([
      db().reports.where('[babyId+date]').between([id, start.value], [id, today.value], true, true).toArray(),
      db().logs.where('[babyId+date]').between([id, shiftDate(start.value, -1)], [id, today.value], true, true).toArray(),
    ])
    const byReport = new Map(reports.map((r) => [r.date, r]))
    const byDate = new Map<DateKey, CareLog[]>()
    for (const l of logs) {
      byDate.set(l.date, [...(byDate.get(l.date) ?? []), l])
    }
    const dates = new Set([...byReport.keys(), ...[...byDate.keys()].filter((d) => d >= start.value)])
    return [...dates]
      .sort((a, b) => b.localeCompare(a))
      .map((date): HistoryItem => {
        const r = byReport.get(date)
        const dayLogs = [...(byDate.get(shiftDate(date, -1)) ?? []), ...(byDate.get(date) ?? [])]
        return {
          date,
          status: r?.publishedAt ? 'published' : r ? 'draft' : 'auto',
          excerpt: r ? excerptOf(r) : '',
          stats: statsOf(date, dayLogs),
          count: byDate.get(date)?.length ?? 0,
        }
      })
  },
  [] as HistoryItem[],
  [() => session.baby?.id, start, today],
)

const groups = computed(() => {
  const out: { month: string; items: HistoryItem[] }[] = []
  for (const it of items.value) {
    const month = dayjs(it.date).format('YYYY年M月')
    const last = out[out.length - 1]
    if (last?.month === month) {
      last.items.push(it)
    } else {
      out.push({ month, items: [it] })
    }
  }
  return out
})
</script>

<template>
  <div class="page">
    <PageNav />
    <div class="page-body">
      <p class="muted intro">最近 {{ DAYS }} 天 · 点击查看当天完整汇报</p>
      <van-empty v-if="!groups.length" description="还没有任何记录，开始记录后这里会自动生成每日汇报" />
      <template v-for="g in groups" :key="g.month">
        <div class="section-title">{{ g.month }}</div>
        <div class="card list">
          <button v-for="it in g.items" :key="it.date" type="button" class="item" @click="router.push({ path: '/report', query: { date: it.date } })">
            <div class="day">
              <strong>{{ dayjs(it.date).date() }}</strong>
              <small>{{ dateLabel(it.date, today).replace(/^.*(周.)$/, '$1') }}</small>
            </div>
            <div class="grow body">
              <div class="row">
                <span class="pill" :class="STATUS_VIEW[it.status].cls">{{ STATUS_VIEW[it.status].text }}</span>
                <span class="muted count">{{ it.count }} 条记录</span>
              </div>
              <div v-if="it.stats" class="stats">{{ it.stats }}</div>
              <div v-if="it.excerpt" class="excerpt ellipsis">{{ it.excerpt }}</div>
            </div>
            <van-icon name="arrow" class="muted" />
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.intro {
  margin: var(--sp-3) var(--sp-1) 0;
  font-size: 12px;
}

.list {
  padding: 0 var(--sp-4);
}

.item {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  width: 100%;
  padding: var(--sp-3) 0;
  border: 0;
  border-bottom: 1px solid var(--bc-border);
  background: none;
  text-align: left;
  cursor: pointer;
}

.item:last-child {
  border-bottom: 0;
}

.day {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 40px;
  flex: none;
}

.day strong {
  font-size: 20px;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}

.day small {
  font-size: 11px;
  color: var(--bc-text-3);
}

.body {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.count {
  font-size: 12px;
}

.stats {
  font-size: 13px;
  color: var(--bc-text-2);
  font-variant-numeric: tabular-nums;
}

.excerpt {
  font-size: 13px;
}
</style>
