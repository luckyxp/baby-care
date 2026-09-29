<!-- ==========================================================================
  数据看板：按日 / 自然周 / 自然月统计宝宝的护理与五大早教领域
  ----------------------------------------------------------------------------
  数字仅来自已录入数据，不把缺失记录当成健康正常。图表附明细表，可脱离颜色阅读。
=========================================================================== -->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { EDU_CATEGORIES, EDU_KEYS } from '@/shared/constants'
import type { CareLog, Checkin, PlanTask } from '@/shared/types'
import { rankCategories, summarizeRange } from '@/domain/dashboard'
import { percent } from '@/domain/stats'
import { db } from '@/db/client'
import { useLive } from '@/db/live'
import { useSession } from '@/stores/session'
import { useClock } from '@/composables/useClock'
import { dayjs, fmtDuration, rangeLabel, rangeOf, shiftDate, type RangeMode } from '@/utils/time'
import BarChart from '@/components/charts/BarChart.vue'
import DayTimeline from '@/components/charts/DayTimeline.vue'
import RadarChart from '@/components/charts/RadarChart.vue'

const session = useSession()
const { today, now } = useClock()
const mode = ref<RangeMode>('day')
const anchor = ref(today.value)
const range = computed(() => rangeOf(mode.value, anchor.value))
const id = computed(() => session.baby?.id ?? '')
const end = computed(() => range.value.end < today.value ? range.value.end : today.value)
const dependencies = [id, () => range.value.start, end]

/* ── 本地数据：前一日用于拆分跨夜睡眠，区间前辅食用于判断首次记录 ── */

const logs = useLive(
  () => db().logs.where('[babyId+date]').between([id.value, shiftDate(range.value.start, -1)], [id.value, end.value], true, true).toArray(),
  [] as CareLog[], dependencies,
)
const tasks = useLive(
  () => db().tasks.where('[babyId+date]').between([id.value, range.value.start], [id.value, end.value], true, true).toArray(),
  [] as PlanTask[], dependencies,
)
const checkins = useLive(
  () => db().checkins.where('[babyId+date]').between([id.value, range.value.start], [id.value, end.value], true, true).toArray(),
  [] as Checkin[], dependencies,
)
const priorFoods = useLive(async () => {
  const records = await db().logs.where('[babyId+date]').between([id.value, ''], [id.value, range.value.start], true, false).toArray()
  return [...new Set(records.filter((l): l is CareLog<'solid'> => l.type === 'solid').flatMap((l) => l.data.foods))]
}, [] as string[], [id, () => range.value.start])

const summary = computed(() => summarizeRange({
  days: range.value.days, logs: logs.value, tasks: tasks.value, checkins: checkins.value,
  today: today.value, now: now.value, priorFoods: priorFoods.value,
}))
const totals = computed(() => summary.value.totals)
const hasMilk = computed(() => totals.value.bottleCount + totals.value.breastCount > 0)
const ranks = computed(() => rankCategories(summary.value.edu))
const radar = computed(() => EDU_KEYS.map((k) => ({ label: EDU_CATEGORIES[k].label, value: summary.value.edu.byCategory[k].done, color: 'var(--chart-ink)' })))
const milkBars = computed(() => summary.value.perDay.map((d) => ({
  key: d.date, label: dayjs(d.date).format('D日'), value: d.milkMl, highlight: d.date === today.value,
})))
const sleepBars = computed(() => summary.value.perDay.map((d) => ({
  key: d.date, label: dayjs(d.date).format('D日'), value: Math.round(d.sleepMin / 6) / 10, highlight: d.date === today.value,
})))
const interactions = computed(() => [
  { title: '日间亲子', icon: '☀️', ratio: summary.value.edu.day },
  { title: '晚间亲子 · 留给父母', icon: '🌙', ratio: summary.value.edu.evening },
])
const canNext = computed(() => range.value.end < today.value)
const lower = computed(() => session.baby?.birthday ?? shiftDate(today.value, -365))
const canPrev = computed(() => range.value.start > lower.value)

function move(direction: number) {
  if ((direction > 0 && !canNext.value) || (direction < 0 && !canPrev.value)) {
    return
  }
  const shifted = shiftDate(anchor.value, direction, mode.value)
  anchor.value = shifted > today.value ? today.value : shifted < lower.value ? lower.value : shifted
}

const formatHours = (n: number) => `${n.toFixed(1)}h`
const names = (list: (typeof EDU_KEYS)[number][]) => list.map((k) => EDU_CATEGORIES[k].label).join('、')
</script>

<template>
  <div class="page page--tab stats-page">
    <header class="page-body header">
      <div class="row row--between"><h1>成长看板</h1><span class="muted">{{ session.baby?.name ?? '宝宝' }}</span></div>
      <div class="filters" aria-label="统计区间">
        <button v-for="m in (['day', 'week', 'month'] as RangeMode[])" :key="m" type="button" :class="{ active: mode === m }" :aria-pressed="mode === m" @click="mode = m">
          {{ { day: '日', week: '周', month: '月' }[m] }}
        </button>
      </div>
      <div class="range-nav">
        <button aria-label="上个区间" :disabled="!canPrev" @click="move(-1)"><van-icon name="arrow-left" /></button>
        <strong>{{ rangeLabel(mode, range) }}</strong>
        <button aria-label="下个区间" :disabled="!canNext" @click="move(1)"><van-icon name="arrow" /></button>
      </div>
      <p class="caption">{{ mode === 'day' ? '仅汇总已记录信息，不用于判断宝宝健康状况。' : `已记录 ${summary.activeDays} 天；奶量日均按有护理记录天数计算，睡眠日均按有睡眠记录天数计算。` }}</p>
    </header>

    <main class="page-body">
      <van-empty v-if="!session.baby" description="请先创建宝宝档案" />
      <template v-else>
        <section v-if="mode === 'day'" class="card">
          <h2 class="card-title">今天的节奏 <small>24 小时记录分布</small></h2>
          <DayTimeline :date="anchor" :logs="logs" :now="now" />
          <p v-if="!summary.activeDays && !totals.sleepMin" class="empty-label">这个日期还没有护理记录</p>
        </section>

        <section class="card">
          <h2 class="card-title">🍼 喂养 <small>瓶喂奶量与亲喂时长分开统计</small></h2>
          <div class="metrics">
            <div><span>{{ mode === 'day' ? '瓶喂总量' : '日均瓶喂量' }}</span><strong>{{ hasMilk ? (mode === 'day' ? totals.milkMl : summary.averages.milkMl) : '未记录' }}<small v-if="hasMilk"> ml</small></strong></div>
            <div><span>喂奶记录</span><strong>{{ hasMilk ? totals.bottleCount + totals.breastCount : '未记录' }}<small v-if="hasMilk"> 次</small></strong></div>
            <div><span>辅食记录</span><strong>{{ totals.solidCount || '未记录' }}<small v-if="totals.solidCount"> 次</small></strong></div>
          </div>
          <p v-if="mode !== 'day' && hasMilk" class="detail">瓶喂总量 {{ totals.milkMl }}ml · {{ totals.bottleCount }} 次</p>
          <p class="detail">{{ totals.breastCount ? `母乳亲喂 ${totals.breastCount} 次，共 ${fmtDuration(totals.breastMin)}` : '未记录母乳亲喂' }}</p>
          <BarChart v-if="mode !== 'day'" :items="milkBars" color="var(--chart-ink)" />
          <template v-if="summary.foods.length">
            <p class="form-label">这段时间吃过</p>
            <div class="foods"><span v-for="f in summary.foods" :key="f" class="pill">{{ f }}<small v-if="summary.newFoods.includes(f)"> · 首次记录</small></span></div>
            <p class="caption">“首次记录”仅指本应用内此前未记录过该食材。</p>
          </template>
        </section>

        <section class="card">
          <h2 class="card-title">😴 睡眠 <small>跨夜睡眠按自然日拆分</small></h2>
          <div class="metrics two">
            <div><span>{{ mode === 'day' ? '当日记录时长' : '日均记录时长' }}</span><strong>{{ totals.sleepMin ? fmtDuration(mode === 'day' ? totals.sleepMin : summary.averages.sleepMin) : '未记录' }}</strong></div>
            <div><span>最长一觉</span><strong>{{ summary.longestSleepMin ? fmtDuration(summary.longestSleepMin) : '未记录' }}</strong></div>
          </div>
          <p class="detail">{{ totals.napCount ? `白天小睡 ${totals.napCount} 次，共 ${fmtDuration(totals.napMin)}` : '未记录白天小睡' }}</p>
          <BarChart v-if="mode !== 'day'" :items="sleepBars" color="var(--chart-ink)" :format="formatHours" />
        </section>

        <section class="card">
          <h2 class="card-title">护理记录</h2>
          <div class="metrics two">
            <div><span>💧 小便</span><strong>{{ totals.pee ? `${totals.pee} 次` : '未记录' }}</strong></div>
            <div><span>💩 大便</span><strong>{{ totals.poop ? `${totals.poop} 次` : '未记录' }}</strong></div>
            <div><span>🌡️ 最高记录体温</span><strong>{{ totals.tempMax === null ? '未测量' : `${totals.tempMax.toFixed(1)}℃` }}</strong></div>
            <div><span>💊 用药 / 补剂</span><strong>{{ totals.medicineCount ? `${totals.medicineCount} 次` : '未记录' }}</strong></div>
          </div>
          <p v-if="totals.abnormalPoop" class="alert">⚠️ {{ totals.abnormalPoop }} 条排便记录有异常标记，请结合实际情况留意。</p>
          <p v-if="totals.feverCount" class="alert">⚠️ {{ totals.feverCount }} 次测温达到应用提醒阈值；不同测量方式有差异，请遵医嘱评估。</p>
          <p class="caption">未记录不代表未发生；图表不代替医生诊断。</p>
        </section>

        <section class="card">
          <h2 class="card-title">五大早教领域 <small>早教 + 亲子互动打卡</small></h2>
          <RadarChart :axes="radar" />
          <div class="categories">
            <div v-for="k in EDU_KEYS" :key="k" class="category">
              <div class="row row--between"><span>{{ EDU_CATEGORIES[k].icon }} {{ EDU_CATEGORIES[k].label }}</span><span>{{ summary.edu.byCategory[k].done }} / {{ summary.edu.byCategory[k].planned }} 次</span></div>
              <div class="track" :aria-label="`${EDU_CATEGORIES[k].label}完成${percent(summary.edu.byCategory[k])}%`"><i :style="{ width: `${percent(summary.edu.byCategory[k])}%`, background: EDU_CATEGORIES[k].color }" /></div>
            </div>
          </div>
          <p v-if="!checkins.length" class="empty-label">暂无活动打卡记录</p>
          <p v-if="mode !== 'day' && ranks.most.length" class="detail">最常练习：{{ names(ranks.most) }}<template v-if="ranks.least.length"><br />可以多陪伴练习：{{ names(ranks.least) }}</template></p>
          <p class="caption">领域次数用于回顾陪伴活动，不是宝宝能力评分。</p>
        </section>

        <section class="card">
          <h2 class="card-title">亲子时光</h2>
          <div v-for="i in interactions" :key="i.title" class="interaction row row--between">
            <span>{{ i.icon }} {{ i.title }}</span>
            <span>{{ i.ratio.done }} / {{ i.ratio.planned }} 项 <small class="muted">{{ i.ratio.planned ? `${percent(i.ratio)}%` : '暂无计划' }}</small></span>
          </div>
        </section>

        <details class="card table-card">
          <summary>查看每日数据明细</summary>
          <div class="table-scroll">
            <table>
              <caption class="caption">无记录指标以 — 表示；瓶喂 ml，睡眠为记录时长。</caption>
              <thead><tr><th scope="col">日期</th><th scope="col">瓶喂 ml</th><th scope="col">亲喂次数</th><th scope="col">辅食次数</th><th scope="col">睡眠</th><th scope="col">大小便</th></tr></thead>
              <tbody><tr v-for="d in summary.perDay" :key="d.date"><th scope="row">{{ dayjs(d.date).format('M.D') }}</th><td>{{ d.bottleCount ? d.milkMl : '—' }}</td><td>{{ d.breastCount || '—' }}</td><td>{{ d.solidCount || '—' }}</td><td>{{ d.sleepMin ? fmtDuration(d.sleepMin) : '—' }}</td><td>{{ d.poop || '—' }} / {{ d.pee || '—' }}</td></tr></tbody>
            </table>
          </div>
        </details>
      </template>
    </main>
  </div>
</template>

<style scoped>
.stats-page { --chart-ink: #2a78d6; }
:global(.van-theme-dark) .stats-page { --chart-ink: #3987e5; }
.header { padding-top: calc(var(--sp-3) + env(safe-area-inset-top)); }
h1 { margin: 0 0 var(--sp-3); font-size: 22px; }
.filters { display: flex; padding: 4px; gap: 4px; border-radius: 14px; background: var(--bc-surface-2); }
.filters button { flex: 1; min-height: 40px; border: 0; border-radius: 10px; background: transparent; cursor: pointer; }
.filters .active { background: var(--bc-surface); box-shadow: var(--bc-shadow); font-weight: 600; }
.range-nav { display: flex; justify-content: space-between; align-items: center; margin-top: var(--sp-2); }
.range-nav button { min-width: 44px; min-height: 44px; border: 0; background: transparent; cursor: pointer; }
.range-nav button:disabled { opacity: .3; }
.caption { color: var(--bc-text-2); font-size: 12px; line-height: 1.6; }
.metrics { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--sp-3); }
.metrics.two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.metrics span { display: block; font-size: 12px; color: var(--bc-text-2); }
.metrics strong { display: block; font-size: 19px; margin-top: 4px; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.metrics small { font-size: 12px; font-weight: 400; }
.detail { font-size: 13px; color: var(--bc-text-2); line-height: 1.7; }
.foods { display: flex; gap: 6px; flex-wrap: wrap; }
.foods small { font-size: 11px; }
.alert { font-size: 13px; padding: var(--sp-2); background: var(--bc-warn-soft); border-radius: 8px; }
.empty-label { color: var(--bc-text-2); text-align: center; font-size: 13px; }
.categories { display: grid; gap: var(--sp-3); font-size: 13px; font-variant-numeric: tabular-nums; }
.track { height: 6px; background: var(--bc-surface-2); border-radius: 4px; margin-top: 6px; }
.track i { display: block; height: 100%; border-radius: inherit; }
.interaction { min-height: 46px; gap: 12px; font-size: 13px; font-variant-numeric: tabular-nums; }
.interaction + .interaction { border-top: 1px solid var(--bc-border); }
.table-card summary { cursor: pointer; min-height: 28px; font-weight: 600; }
.table-scroll { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; font-size: 12px; font-variant-numeric: tabular-nums; }
th, td { padding: 10px 6px; text-align: right; border-bottom: 1px solid var(--bc-border); white-space: nowrap; }
th:first-child { text-align: left; }
</style>
