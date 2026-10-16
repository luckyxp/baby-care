/* ============================================================================
 *  日模板初始内容：覆盖各月龄阶段，入库后按普通个人模板管理。
 * ----------------------------------------------------------------------------
 *  固定月龄样本只用于构造初始内容，避免模板随宝宝生日或当前日期变化。
 *  每个宝宝、每个月龄阶段使用固定 ID，删除记录也能阻止再次初始化。
 * ========================================================================== */

import { STAGES } from '@/library'
import type { Baby, PlanTemplate } from '@/shared/types'
import { dayjs } from '@/utils/time'
import { normalizeTemplateTasks } from './plan-task'
import { recommendPlan } from './planner'

export function createDailyTemplatePresets(baby: Baby): Pick<PlanTemplate, 'id' | 'babyId' | 'name' | 'tasks'>[] {
  const sample = { ...baby, birthday: '2024-01-01' }
  return STAGES.map((stage) => {
    const date = dayjs(sample.birthday).add(stage.min, 'month').format('YYYY-MM-DD')
    return {
      id: `daily-template:${baby.id}:${stage.key}`, babyId: baby.id,
      name: `${stage.range} · ${stage.title}`,
      tasks: normalizeTemplateTasks(recommendPlan(sample, date).tasks),
    }
  })
}
