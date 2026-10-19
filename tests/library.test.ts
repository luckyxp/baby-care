/* ============================================================================
 *  素材库覆盖度测试
 * ----------------------------------------------------------------------------
 *  守住三条底线：
 *    1. 结构正确   —— id 唯一、阶段首尾相接、作息格式合法；
 *    2. 内容够用   —— 任一阶段、任一领域都有足够活动可供每日轮换；
 *    3. 喂养安全   —— 蜂蜜/鲜奶月龄限制、1 岁内食谱不加盐糖。
 * ========================================================================== */

import { describe, expect, it } from 'vitest'
import type { EduCategory, Slot } from '@/shared/types'
import {
  CARE_GUIDES, EDU_ACTIVITIES, FEEDING_PRINCIPLES, FOODS, FOOD_NAMES, INTERACTIONS, RECIPES, STAGES,
  careGuidesFor, eduFor, findLibraryItem, foodsFor, inRange, interactionsFor, recipesFor, stageOf,
} from '@/library'
import type { Stage } from '@/library'

const CATEGORIES: EduCategory[] = ['gross', 'fine', 'sensory', 'language', 'social']
const PREFIX: Record<EduCategory, string> = { gross: 'g', fine: 'f', sensory: 's', language: 'l', social: 'c' }
const STAGE_KEYS = ['m0', 'm1', 'm2', 'm3', 'm4', 'm6', 'm8', 'm10', 'm12', 'm18', 'm24']

/** 阶段中点月龄；末段上界视为 36 月，即取 30 */
const midOf = (s: Stage) => (s.min + Math.min(s.max, 36)) / 2

/* ── 结构 ───────────────────────────────────────────────────────────────── */

describe('结构', () => {
  it('素材 id 全局唯一', () => {
    const ids = [...EDU_ACTIVITIES, ...INTERACTIONS, ...RECIPES].map((x) => x.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('食材名称唯一', () => {
    expect(new Set(FOOD_NAMES).size).toBe(FOODS.length)
  })

  it('阶段 key 与区间严格符合约定，且从 0 起首尾相接', () => {
    expect(STAGES.map((s) => s.key)).toEqual(STAGE_KEYS)
    expect(STAGES[0].min).toBe(0)
    STAGES.forEach((s, i) => {
      expect(s.min).toBeLessThan(s.max)
      if (i > 0) {
        expect(s.min).toBe(STAGES[i - 1].max)
      }
    })
    expect(STAGES[STAGES.length - 1].max).toBeGreaterThanOrEqual(36)
  })

  it('作息时间为 HH:mm 且严格升序，每阶段都含维生素D补剂', () => {
    for (const s of STAGES) {
      const times = s.schedule.map((x) => x.time)
      times.forEach((t) => expect(t).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/))
      expect([...times].sort()).toEqual(times)
      expect(new Set(times).size).toBe(times.length)
      expect(s.schedule.some((x) => x.kind === 'supplement' && x.title.includes('维生素D'))).toBe(true)
    }
  })

  it('奶量时点带 ml；6 月龄前无辅食，6 月龄起有辅食时点且 amount 为 null', () => {
    for (const s of STAGES) {
      s.schedule.filter((x) => x.kind === 'milk').forEach((x) => expect(x.amount).toBeGreaterThan(0))
      s.schedule.filter((x) => x.kind === 'supplement' || x.kind === 'solid').forEach((x) => expect(x.amount).toBeNull())
      const solids = s.schedule.filter((x) => x.kind === 'solid')
      expect(s.solid.enabled).toBe(s.min >= 6)
      if (s.min < 6) {
        expect(solids).toHaveLength(0)
      } else {
        expect(solids.length).toBeGreaterThan(0)
      }
    }
  })

  it('12 月龄起为三餐两点 + 奶', () => {
    for (const s of STAGES.filter((x) => x.min >= 12)) {
      expect(s.schedule.filter((x) => x.kind === 'solid').length).toBeGreaterThanOrEqual(5)
      expect(s.schedule.some((x) => x.kind === 'milk')).toBe(true)
    }
  })

  it('阶段参考值区间合法', () => {
    for (const s of STAGES) {
      for (const [lo, hi] of [s.milk.perFeed, s.milk.times, s.milk.daily, s.sleep.total]) {
        expect(lo).toBeGreaterThan(0)
        expect(lo).toBeLessThanOrEqual(hi)
      }
      expect(s.milestones.length).toBeGreaterThanOrEqual(3)
      expect(s.milestones.length).toBeLessThanOrEqual(4)
    }
  })
})

/* ── 早教活动 ───────────────────────────────────────────────────────────── */

describe('早教活动', () => {
  it('总数 ≥ 388，每个领域 ≥ 66，id 前缀与领域一致', () => {
    expect(EDU_ACTIVITIES.length).toBeGreaterThanOrEqual(388)
    for (const c of CATEGORIES) {
      const list = EDU_ACTIVITIES.filter((a) => a.category === c)
      expect(list.length, c).toBeGreaterThanOrEqual(66)
      list.forEach((a) => expect(a.id).toMatch(new RegExp(`^${PREFIX[c]}\\d{2,}$`)))
    }
  })

  it('字段完整：步骤 2-4 步、时长为正、月龄区间合法', () => {
    for (const a of EDU_ACTIVITIES) {
      expect(a.steps.length, a.id).toBeGreaterThanOrEqual(2)
      expect(a.steps.length, a.id).toBeLessThanOrEqual(4)
      expect(a.duration, a.id).toBeGreaterThan(0)
      expect(a.min, a.id).toBeLessThan(a.max)
      expect(a.max, a.id).toBeLessThanOrEqual(36)
      expect(a.goal && a.observe && a.title, a.id).toBeTruthy()
    }
  })

  it.each(STAGES.map((s) => [s.key, midOf(s)] as const))('阶段 %s（%s 月）每个领域至少 3 条可选', (_key, m) => {
    for (const c of CATEGORIES) {
      expect(eduFor(m, c).length, `${c}@${m}`).toBeGreaterThanOrEqual(3)
    }
  })

  it('0-36 月任意月龄每个领域至少 2 条（按 0.25 月步进抽查）', () => {
    for (let m = 0; m < 36; m += 0.25) {
      for (const c of CATEGORIES) {
        expect(eduFor(m, c).length, `${c}@${m}`).toBeGreaterThanOrEqual(2)
      }
    }
  })
})

/* ── 亲子互动 ───────────────────────────────────────────────────────────── */

describe('亲子互动', () => {
  const count = (slot: Slot) => INTERACTIONS.filter((i) => i.slot === slot).length

  it('总数 ≥ 143，晚间 ≥ 78，日间 ≥ 65，id 为 i 加至少两位数字', () => {
    expect(INTERACTIONS.length).toBeGreaterThanOrEqual(143)
    expect(count('evening')).toBeGreaterThanOrEqual(78)
    expect(count('day')).toBeGreaterThanOrEqual(65)
    INTERACTIONS.forEach((i) => expect(i.id).toMatch(/^i\d{2,}$/))
  })

  it('每条都归属五大领域之一，且五个领域都有覆盖', () => {
    INTERACTIONS.forEach((i) => expect(CATEGORIES).toContain(i.category))
    expect(new Set(INTERACTIONS.map((i) => i.category)).size).toBe(CATEGORIES.length)
  })

  it.each(STAGES.map((s) => [s.key, midOf(s)] as const))('阶段 %s（%s 月）晚间 ≥ 3 条、日间 ≥ 1 条', (_key, m) => {
    expect(interactionsFor(m, 'evening').length).toBeGreaterThanOrEqual(3)
    expect(interactionsFor(m, 'day').length).toBeGreaterThanOrEqual(1)
  })
})

/* ── 喂养素材 ───────────────────────────────────────────────────────────── */

describe('喂养素材', () => {
  const GROUPS = ['grain', 'veg', 'fruit', 'meat', 'egg', 'fish', 'bean', 'dairy']

  it('食材 ≥ 160 种，分组合法', () => {
    expect(FOODS.length).toBeGreaterThanOrEqual(160)
    FOODS.forEach((f) => expect(GROUPS).toContain(f.group))
  })

  it('蜂蜜、鲜牛奶 12 月龄起', () => {
    const honey = FOODS.filter((f) => f.name.includes('蜂蜜'))
    const milk = FOODS.filter((f) => f.name.includes('鲜牛奶'))
    expect(honey.length).toBeGreaterThan(0)
    expect(milk.length).toBeGreaterThan(0)
    honey.forEach((f) => expect(f.min).toBeGreaterThanOrEqual(12))
    milk.forEach((f) => expect(f.min).toBeGreaterThanOrEqual(12))
  })

  it('常见过敏原都已标记', () => {
    const allergenic = /鸡蛋|鹌鹑蛋|鲜鸭蛋|鲜鹅蛋|鱼|虾|蟹(?!味菇)|花生|核桃|杏仁|腰果|榛子|坚果|豆腐|毛豆|大豆|黑豆|面条|馒头|馄饨|小麦|大麦|荞麦|意大利面|酸奶|奶酪|牛奶|凝乳|开菲尔/
    FOODS.filter((f) => allergenic.test(f.name)).forEach((f) => expect(f.allergen, f.name).toBe(true))
    expect(FOODS.find((f) => f.name === '蟹味菇')?.allergen).toBe(false)
  })

  it('坚果只以粉 / 酱形式出现', () => {
    FOODS.filter((f) => /花生|核桃|杏仁|腰果|榛子|坚果/.test(f.name))
      .forEach((f) => expect(f.name, f.name).toMatch(/粉|酱/))
  })

  it('食谱 ≥ 256 道，覆盖 6 → 24+ 月，id 为 r 加至少两位数字', () => {
    expect(RECIPES.length).toBeGreaterThanOrEqual(256)
    RECIPES.forEach((r) => expect(r.id).toMatch(/^r\d{2,}$/))
    const mins = RECIPES.map((r) => r.min)
    expect(Math.min(...mins)).toBe(6)
    expect(Math.max(...mins)).toBeGreaterThanOrEqual(24)
    for (const m of [6, 7, 8, 9, 10, 12, 18, 24]) {
      expect(RECIPES.some((r) => r.min === m || (r.min <= m && m - r.min < 2)), `@${m}`).toBe(true)
    }
  })

  it('12 月龄内食谱的用料与步骤不含盐、糖（否定表述除外）', () => {
    const NEGATION = /无盐|不加盐|不放盐|无糖|不加糖|不放糖/g
    for (const r of RECIPES.filter((x) => x.min < 12)) {
      const text = [...r.ingredients, ...r.steps].join('|').replace(NEGATION, '')
      expect(text, r.id).not.toMatch(/[盐糖]/)
    }
  })

  it('喂养原则 8-12 条', () => {
    expect(FEEDING_PRINCIPLES.length).toBeGreaterThanOrEqual(8)
    expect(FEEDING_PRINCIPLES.length).toBeLessThanOrEqual(12)
  })
})

/* ---- 扩充素材的完整性与安全约束 ---- */

describe('扩充素材', () => {
  it('五类素材合计超过 1000 条，每类内部名称唯一', () => {
    expect(EDU_ACTIVITIES.length + INTERACTIONS.length + FOODS.length + RECIPES.length + CARE_GUIDES.length)
      .toBeGreaterThanOrEqual(1000)
    const groups = [
      EDU_ACTIVITIES.map((a) => a.title), INTERACTIONS.map((a) => a.title),
      FOODS.map((f) => f.name), RECIPES.map((r) => r.name), CARE_GUIDES.map((g) => g.title),
    ]
    groups.forEach((names) => expect(new Set(names).size).toBe(names.length))
  })

  it('全部计划素材均可用稳定 ID 反查', () => {
    for (const item of [...EDU_ACTIVITIES, ...INTERACTIONS, ...RECIPES]) {
      expect(findLibraryItem(item.id), item.id).toBe(item)
    }
  })

  it('亲子素材有完整步骤、贴士和有效推荐区间', () => {
    for (const item of INTERACTIONS) {
      expect(item.min, item.id).toBeGreaterThanOrEqual(0)
      expect(item.max, item.id).toBeGreaterThan(item.min)
      expect(item.max, item.id).toBeLessThanOrEqual(36)
      expect(item.duration, item.id).toBeGreaterThan(0)
      expect(item.steps.length, item.id).toBeGreaterThanOrEqual(2)
      expect(item.steps.every((step) => step.trim()), item.id).toBe(true)
      expect(item.goal && item.tip, item.id).toBeTruthy()
    }
  })

  it('扩充食谱完整，复合配方的过敏原与实际用料一致', () => {
    const recipes = RECIPES.filter((r) => Number(r.id.slice(1)) >= 57)
    for (const r of recipes) {
      expect(r.ingredients.length, r.id).toBeGreaterThanOrEqual(3)
      expect(r.steps.length, r.id).toBe(4)
      expect(r.steps.every((step) => step.trim()), r.id).toBe(true)
      expect(r.tip && r.texture, r.id).toBeTruthy()
      const ingredients = r.ingredients.join(' ')
      const allergens = [
        [/鸡蛋/, '鸡蛋'], [/小麦|婴儿面条/, '小麦'], [/豆腐|黑豆/, '大豆'],
        [/鳕鱼|三文鱼|鲈鱼|罗非鱼/, '鱼'], [/虾/, '虾'], [/酸奶|奶酪|鲜牛奶/, '牛奶'],
        [/芝麻/, '芝麻'], [/花生/, '花生'], [/核桃/, '核桃'], [/杏仁/, '杏仁'], [/腰果/, '腰果'],
      ] as const
      allergens.forEach(([pattern, allergen]) => {
        if (pattern.test(ingredients)) expect(r.allergens, r.id).toContain(allergen)
      })
      if (/鲜牛奶/.test(ingredients)) expect(r.min, r.id).toBeGreaterThanOrEqual(12)
    }
    expect(findLibraryItem('r200')).toMatchObject({ allergens: ['小麦', '鸡蛋', '虾'] })
    expect(findLibraryItem('r231')).toMatchObject({ min: 12, meal: 'snack', allergens: ['牛奶'] })
    expect(findLibraryItem('r256')).toMatchObject({ allergens: ['大豆'] })
  })

  it('护理知识 ≥ 80 条，ID 唯一、内容完整、月龄筛选遵循左闭右开', () => {
    expect(CARE_GUIDES.length).toBeGreaterThanOrEqual(80)
    expect(new Set(CARE_GUIDES.map((g) => g.id)).size).toBe(CARE_GUIDES.length)
    expect(new Set(CARE_GUIDES.map((g) => g.category)).size).toBe(4)
    for (const g of CARE_GUIDES) {
      expect(g.min, g.id).toBeGreaterThanOrEqual(0)
      expect(g.max, g.id).toBeGreaterThan(g.min)
      expect(g.max, g.id).toBeLessThanOrEqual(36)
      expect(g.summary && g.title, g.id).toBeTruthy()
      expect(g.points.length, g.id).toBeGreaterThanOrEqual(3)
      expect(careGuidesFor(g.min), g.id).toContain(g)
      expect(careGuidesFor(g.max), g.id).not.toContain(g)
    }
  })
})

/* ── 查询函数 ───────────────────────────────────────────────────────────── */

describe('查询函数', () => {
  it('inRange 左闭右开', () => {
    expect(inRange({ min: 3, max: 6 }, 3)).toBe(true)
    expect(inRange({ min: 3, max: 6 }, 5.99)).toBe(true)
    expect(inRange({ min: 3, max: 6 }, 6)).toBe(false)
    expect(inRange({ min: 3, max: 6 }, 2.99)).toBe(false)
  })

  it('stageOf 边界与越界夹取', () => {
    expect(stageOf(0).key).toBe('m0')
    expect(stageOf(0.99).key).toBe('m0')
    expect(stageOf(1).key).toBe('m1')
    expect(stageOf(5.99).key).toBe('m4')
    expect(stageOf(6).key).toBe('m6')
    expect(stageOf(24).key).toBe('m24')
    expect(stageOf(-1).key).toBe('m0')
    expect(stageOf(2000).key).toBe('m24')
  })

  it('eduFor / interactionsFor 过滤条件正确', () => {
    eduFor(5, 'gross').forEach((a) => {
      expect(a.category).toBe('gross')
      expect(inRange(a, 5)).toBe(true)
    })
    expect(eduFor(5).length).toBe(CATEGORIES.reduce((n, c) => n + eduFor(5, c).length, 0))
    interactionsFor(9, 'evening').forEach((i) => {
      expect(i.slot).toBe('evening')
      expect(inRange(i, 9)).toBe(true)
    })
  })

  it('foodsFor / recipesFor 按起始月龄过滤，食谱越贴近月龄越靠前', () => {
    expect(foodsFor(6).every((f) => f.min <= 6)).toBe(true)
    expect(foodsFor(6).some((f) => f.name === '蜂蜜')).toBe(false)
    expect(foodsFor(12).some((f) => f.name === '蜂蜜')).toBe(true)
    const list = recipesFor(10)
    expect(list.every((r) => r.min <= 10)).toBe(true)
    list.slice(1).forEach((r, i) => expect(r.min).toBeLessThanOrEqual(list[i].min))
  })

  it('findLibraryItem 可反查早教 / 亲子 / 食谱', () => {
    expect(findLibraryItem('g01')).toMatchObject({ title: '俯卧抬头', category: 'gross' })
    expect(findLibraryItem('i01')).toMatchObject({ slot: 'evening' })
    expect(findLibraryItem('r01')).toMatchObject({ name: '高铁米粉糊' })
    expect(findLibraryItem('nope')).toBeUndefined()
  })
})
