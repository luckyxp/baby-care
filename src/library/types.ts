/* ============================================================================
 *  内置素材库 · 类型定义
 * ----------------------------------------------------------------------------
 *  月龄区间一律采用左闭右开 [min, max)，单位为"月"（可为小数）。
 *  例如 { min: 3, max: 6 } 覆盖 3 个月 0 天 ~ 5 个月 30 天。
 * ========================================================================== */

import type { EduCategory, ScheduleSlot, Slot } from '@/shared/types'

/** 月龄阶段方案：系统据宝宝生日自动匹配 */
export interface Stage {
  key: string
  min: number
  max: number
  title: string
  range: string
  milestones: string[]
  focus: string
  milk: {
    perFeed: [number, number]   // 单次奶量 ml
    times: [number, number]     // 每日次数
    daily: [number, number]     // 全天总量 ml
    interval: string
    tip: string
  }
  solid: {
    enabled: boolean
    meals: number
    texture: string
    tip: string
  }
  sleep: {
    total: [number, number]     // 全天睡眠小时
    naps: string
    tip: string
  }
  /** 默认喂养作息（育儿嫂未自定义时使用） */
  schedule: ScheduleSlot[]
}

/** 早教活动（日间，育儿嫂执行） */
export interface EduActivity {
  id: string
  category: EduCategory
  min: number
  max: number
  title: string
  duration: number
  materials: string[]
  steps: string[]
  goal: string
  /** 观察要点：打卡时提示育儿嫂记录宝宝表现 */
  observe: string
}

/** 亲子互动（推荐时段 + 对应领域，便于统计五大领域频次） */
export interface Interaction {
  id: string
  slot: Slot
  category: EduCategory
  min: number
  max: number
  title: string
  duration: number
  materials: string[]
  steps: string[]
  goal: string
  /** 给执行人的小贴士（晚间项目面向爸爸妈妈） */
  tip: string
}

export type FoodGroup = 'grain' | 'veg' | 'fruit' | 'meat' | 'egg' | 'fish' | 'bean' | 'dairy'

export interface Food {
  name: string
  min: number
  group: FoodGroup
  allergen: boolean
  tip: string
}

export interface Recipe {
  id: string
  name: string
  min: number
  texture: string
  meal: 'main' | 'snack'
  ingredients: string[]
  steps: string[]
  tip: string
  allergens: string[]
}

export type LibraryItem = EduActivity | Interaction | Recipe
