/* ============================================================================
 *  内置素材库 · 统一出口
 * ----------------------------------------------------------------------------
 *  业务侧只从这里取数：数据常量 + 按月龄检索的纯函数。
 *  月龄区间一律左闭右开 [min, max)；食材与食谱只有起始月龄，按 min <= 月龄 过滤。
 * ========================================================================== */

import type { EduCategory, Slot } from '@/shared/types'
import type { EduActivity, Food, Interaction, LibraryItem, Recipe, Stage } from './types'
import { STAGES } from './stages'
import { EDU_ACTIVITIES } from './edu'
import { INTERACTIONS } from './interaction'
import { FOODS, RECIPES } from './feeding'

export type * from './types'
export * from './stages'
export * from './edu'
export * from './interaction'
export * from './feeding'

/* ── 月龄匹配 ───────────────────────────────────────────────────────────── */

export function inRange(item: { min: number; max: number }, months: number): boolean {
  return item.min <= months && months < item.max
}

/** 按月龄匹配阶段方案；超出范围时夹到首/末阶段 */
export function stageOf(months: number): Stage {
  if (months < STAGES[0].min) {
    return STAGES[0]
  }
  return STAGES.find((s) => inRange(s, months)) ?? STAGES[STAGES.length - 1]
}

/* ── 按月龄检索 ─────────────────────────────────────────────────────────── */

export function eduFor(months: number, category?: EduCategory): EduActivity[] {
  return EDU_ACTIVITIES.filter((a) => inRange(a, months) && (!category || a.category === category))
}

export function interactionsFor(months: number, slot?: Slot): Interaction[] {
  return INTERACTIONS.filter((i) => inRange(i, months) && (!slot || i.slot === slot))
}

export function foodsFor(months: number): Food[] {
  return FOODS.filter((f) => f.min <= months)
}

/** 可做的食谱；越贴近当前月龄的越靠前（同月龄保持编排顺序） */
export function recipesFor(months: number): Recipe[] {
  return RECIPES.filter((r) => r.min <= months).sort((a, b) => b.min - a.min)
}

/* ── 条目反查 ───────────────────────────────────────────────────────────── */

const ITEM_INDEX = new Map<string, LibraryItem>(
  [...EDU_ACTIVITIES, ...INTERACTIONS, ...RECIPES].map((item) => [item.id, item]),
)

/** 由计划任务的 sourceId 反查素材条目（早教 / 亲子 / 食谱） */
export function findLibraryItem(id: string): EduActivity | Interaction | Recipe | undefined {
  return ITEM_INDEX.get(id)
}

export const FOOD_NAMES: string[] = FOODS.map((f) => f.name)
