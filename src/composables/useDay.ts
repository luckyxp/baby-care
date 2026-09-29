/* ============================================================================
 *  useDay · 某个宝宝某一天的全部数据（本地库实时查询）
 * ----------------------------------------------------------------------------
 *  日志额外包含前一天（跨夜睡眠、环比），dayLogs 才是当天本身。
 *  首页、计划、汇报共用，保证三处看到的是同一份数据。
 * ========================================================================== */

import { computed, type Ref } from 'vue'
import type { CareLog, Checkin, DateKey, Note, Plan, PlanTask, Report } from '@/shared/types'
import { db } from '@/db/client'
import { useLive } from '@/db/live'
import { useSession } from '@/stores/session'
import { shiftDate } from '@/utils/time'

const byTime = (a: CareLog, b: CareLog) => a.time - b.time

export function useDay(date: Readonly<Ref<DateKey>>) {
  const session = useSession()
  const babyId = computed(() => session.baby?.id ?? '')
  const deps = [babyId, date]
  const key = () => [babyId.value, date.value] as const

  const logs = useLive(
    async () => {
      const [id, d] = key()
      const rows = await db().logs.where('[babyId+date]').between([id, shiftDate(d, -1)], [id, d], true, true).toArray()
      return rows.sort(byTime)
    },
    [] as CareLog[],
    deps,
  )
  const tasks = useLive(
    async () => (await db().tasks.where('[babyId+date]').equals(key()).toArray()).sort((a, b) =>
      (a.time ?? '99:99').localeCompare(b.time ?? '99:99') || a.order - b.order),
    [] as PlanTask[],
    deps,
  )
  const checkins = useLive(() => db().checkins.where('[babyId+date]').equals(key()).toArray(), [] as Checkin[], deps)
  const notes = useLive(
    async () => (await db().notes.where('[babyId+date]').equals(key()).toArray()).sort((a, b) => a.createdAt - b.createdAt),
    [] as Note[],
    deps,
  )
  const plan = useLive(
    async () => (await db().plans.where('[babyId+date]').equals(key()).first()) ?? null,
    null as Plan | null,
    deps,
  )
  const report = useLive(
    async () => (await db().reports.where('[babyId+date]').equals(key()).first()) ?? null,
    null as Report | null,
    deps,
  )

  const dayLogs = computed(() => logs.value.filter((l) => l.date === date.value))
  const checkinOf = computed(() => new Map(checkins.value.map((c) => [c.taskId, c])))
  const notesOf = (targetType: Note['targetType'], targetId: string) =>
    notes.value.filter((n) => n.targetType === targetType && n.targetId === targetId)

  return { babyId, logs, dayLogs, tasks, checkins, checkinOf, notes, notesOf, plan, report }
}
