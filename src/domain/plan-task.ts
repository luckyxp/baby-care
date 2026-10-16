/* ============================================================================
 *  任务输入与日模板 · 统一校验
 * ----------------------------------------------------------------------------
 *  计划编辑、模板编辑和模拟云共用规则；模板只保留可重复应用的内容字段。
 * ========================================================================== */

import { EDU_KEYS } from '@/shared/constants'
import { ApiError } from '@/shared/errors'
import type { PlanTask, TemplateTask } from '@/shared/types'

export type TaskInput = Pick<PlanTask, 'kind' | 'category' | 'slot' | 'title' | 'desc' | 'steps' | 'time' | 'amount'>

export function normalizeTaskInput(input: TaskInput): TaskInput & Pick<PlanTask, 'assignee'> {
  const feeding = input.kind === 'feeding'
  const categories: readonly string[] = feeding ? ['milk', 'solid', 'supplement', 'water'] : EDU_KEYS
  if (!['feeding', 'edu', 'interaction'].includes(input.kind)
    || !['day', 'evening'].includes(input.slot)
    || typeof input.title !== 'string' || !input.title.trim() || !input.category || !categories.includes(input.category)) {
    throw new ApiError('INVALID', '请填写任务名称并选择正确类型、类别和时段')
  }
  if (input.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time)) {
    throw new ApiError('INVALID', '时间格式应为 HH:mm')
  }
  if (input.amount !== null && (!Number.isFinite(input.amount) || input.amount < 0 || input.amount > 400)) {
    throw new ApiError('INVALID', '计划量应在 0-400ml 之间')
  }
  if (typeof input.desc !== 'string' || !Array.isArray(input.steps) || input.steps.some((step) => typeof step !== 'string')) {
    throw new ApiError('INVALID', '请填写正确的任务说明和步骤')
  }
  const slot = feeding && input.time ? (input.time >= '06:00' && input.time < '19:00' ? 'day' : 'evening') : input.slot
  return {
    kind: input.kind, category: input.category, slot,
    assignee: !feeding && slot === 'evening' ? 'parent' : 'nanny',
    title: input.title.trim(), desc: input.desc.trim(),
    steps: input.steps.map((step) => step.trim()).filter(Boolean),
    time: input.time || null,
    amount: feeding && (input.category === 'milk' || input.category === 'water') ? input.amount : null,
  }
}

export function normalizeTemplateTasks(tasks: readonly TemplateTask[]): TemplateTask[] {
  if (!Array.isArray(tasks) || !tasks.length) throw new ApiError('INVALID', '请至少添加一项日模板任务')
  return tasks.map((task, index) => {
    if (!task) throw new ApiError('INVALID', '请使用日模板任务结构')
    const { assignee: _assignee, ...input } = normalizeTaskInput(task)
    return { ...input, sourceId: typeof task.sourceId === 'string' ? task.sourceId : null, order: index + 1 }
  })
}
