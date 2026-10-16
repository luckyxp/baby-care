/* ============================================================================
 * 模板应用：本地与云端共用完成保护、去重及每日任务身份，保证生成结果一致。
 * ========================================================================== */

import type { CareLog, Checkin, PlanTask, PlanTemplate, TemplateKind } from '@/shared/types'
import { matchFeeding } from './planner'
import { normalizeTemplateTasks } from './plan-task'

export const templateScheduleId = (babyId: string, kind: TemplateKind) => `template-schedule:${babyId}:${kind}`
export const recurringTaskId = (babyId: string, date: string, revision: string, order: number) => `daily:${babyId}:${date}:${revision}:${order}`

export function prepareTemplateApplication(
  tasks: PlanTask[], checkins: Checkin[], logs: CareLog[], template: Pick<PlanTemplate, 'kind' | 'tasks'>,
) {
  const entries = normalizeTemplateTasks(template.tasks, template.kind)
  const signature = (task: PlanTask | PlanTemplate['tasks'][number]) => JSON.stringify([
    task.kind, task.category, task.slot, task.time, task.sourceId, task.title,
  ])
  const completed = new Set([
    ...checkins.map((checkin) => checkin.taskId),
    ...logs.flatMap((log) => log.taskId ? [log.taskId] : []),
    ...matchFeeding(tasks, logs).keys(),
  ])
  const scoped = tasks.filter((task) => (task.kind === 'feeding') === (template.kind === 'feeding'))
  const retained = new Map<string, number>()
  for (const task of scoped.filter((task) => completed.has(task.id))) {
    const key = signature(task)
    retained.set(key, (retained.get(key) ?? 0) + 1)
  }
  return {
    removed: scoped.filter((task) => !completed.has(task.id)),
    entries: entries.filter((entry) => {
      const key = signature(entry)
      const count = retained.get(key) ?? 0
      if (!count) return true
      retained.set(key, count - 1)
      return false
    }),
  }
}
