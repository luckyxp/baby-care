/* ============================================================================
 *  语音解析器单测 · 固定 now = 2026-09-28 16:20（本地时区）
 * ========================================================================== */

import { describe, expect, it } from 'vitest'
import { cnToArabic, parseVoice } from '@/domain/voice-parser'
import type { VoiceDraft } from '@/domain/voice-parser'
import type {
  DiaperData, GrowthData, MedicineData, MilkData, SleepData, SolidData, TempData,
} from '@/shared/types'
import { MEDICINE_PRESETS, SOLID_AMOUNTS, STOOL_COLORS, STOOL_TEXTURES } from '@/shared/constants'

const NOW = new Date(2026, 8, 28, 16, 20).getTime()
const MIN = 60000

/** 当天（或偏移若干天）的某个时刻 */
const at = (h: number, m = 0, dayOffset = 0): number => new Date(2026, 8, 28 + dayOffset, h, m).getTime()

const parse = (text: string, now = NOW, foods?: string[]): VoiceDraft[] => parseVoice(text, { now, foods })
const one = (text: string, now = NOW): VoiceDraft => {
  const list = parse(text, now)
  expect(list).toHaveLength(1)
  return list[0]
}

/* ── cnToArabic ─────────────────────────────────────────────────────────── */

describe('cnToArabic 中文数字规范化', () => {
  it.each([
    ['一百二十', '120'],
    ['一百五', '150'],
    ['两百', '200'],
    ['二百', '200'],
    ['二百四', '240'],
    ['三十', '30'],
    ['十五', '15'],
    ['一百零五', '105'],
  ])('%s → %s', (input, output) => {
    expect(cnToArabic(input)).toBe(output)
  })

  it('时长：一个半小时 / 半小时 / 两个钟头', () => {
    expect(cnToArabic('一个半小时')).toBe('1.5小时')
    expect(cnToArabic('半小时')).toBe('0.5小时')
    expect(cnToArabic('两个钟头')).toBe('2小时')
  })

  it('体温：三十七度五 / 37度5 / 三十七点五度', () => {
    expect(cnToArabic('三十七度五')).toBe('37.5度')
    expect(cnToArabic('37度5')).toBe('37.5度')
    expect(cnToArabic('三十七点五度')).toBe('37.5度')
  })

  it.each([
    ['三点半', '3:30'],
    ['十点一刻', '10:15'],
    ['两点四十', '2:40'],
    ['九点零五', '9:05'],
    ['下午三点二十分', '下午3:20'],
  ])('时刻 %s → %s', (input, output) => {
    expect(cnToArabic(input)).toBe(output)
  })

  it('不误伤量词与固定词', () => {
    expect(cnToArabic('一般')).toBe('一般')
    expect(cnToArabic('吃了一碗')).toBe('吃了一碗')
    expect(cnToArabic('吃了一点点')).not.toContain(':')
    expect(cnToArabic('拉了一次')).toBe('拉了1次')
  })
})

/* ── 喂奶 ───────────────────────────────────────────────────────────────── */

describe('喂奶', () => {
  it('刚刚 + 毫升 + 奶粉', () => {
    const d = one('刚喝了150毫升奶粉')
    expect(d.type).toBe('milk')
    expect(d.time).toBe(NOW)
    expect(d.data).toEqual<MilkData>({ mode: 'formula', amount: 150, duration: null, side: null })
  })

  it('歧义时刻取不晚于 now 的最近一个：三点 → 15:00', () => {
    const d = one('三点喝了一百二十毫升配方奶')
    expect(d.time).toBe(at(15))
    expect((d.data as MilkData).amount).toBe(120)
  })

  it('上午修饰 + ml', () => {
    const d = one('上午十点喝了奶粉180ml')
    expect(d.time).toBe(at(10))
    expect((d.data as MilkData).amount).toBe(180)
  })

  it('晚上八点晚于 now → 取昨天 20:00；无"奶"字也按奶量兜底', () => {
    const d = one('晚上八点喝了200毫升')
    expect(d.type).toBe('milk')
    expect(d.time).toBe(at(20, 0, -1))
  })

  it('凌晨两点 + 夜奶', () => {
    const d = one('凌晨两点吃了夜奶90毫升')
    expect(d.time).toBe(at(2))
    expect((d.data as MilkData).amount).toBe(90)
  })

  it('今天的 03:00 与 15:00 都晚于 now 时取昨天 15:00', () => {
    const now = at(2)
    const d = one('3点喝了奶', now)
    expect(d.time).toBe(at(15, 0, -1))
  })

  it('九点零五：21:05 未到 → 今天 09:05', () => {
    expect(one('九点零五喝奶').time).toBe(at(9, 5))
  })

  it('亲喂左边15分钟', () => {
    const d = one('亲喂左边15分钟')
    expect(d.data).toEqual<MilkData>({ mode: 'breast', amount: null, duration: 15, side: 'left' })
  })

  it('母乳瓶喂', () => {
    expect((one('母乳瓶喂120毫升').data as MilkData).mode).toBe('bottle_breast')
  })

  it('"左右"表示约数，不是哺乳侧', () => {
    const d = one('喝奶150毫升左右')
    expect(d.data).toEqual<MilkData>({ mode: 'formula', amount: 150, duration: null, side: null })
  })

  it('续句补奶量：喝了奶粉，150毫升', () => {
    const d = one('喝了奶粉，150毫升')
    expect((d.data as MilkData).amount).toBe(150)
    expect(d.note).toBe('喝了奶粉，150毫升')
  })
})

/* ── 多分句与时间继承 ───────────────────────────────────────────────────── */

describe('多分句与时间', () => {
  it('喂奶 + 排便，排便继承上一句的时刻', () => {
    const text = '三点喝了150毫升奶粉，拉了一次黄色软便'
    const list = parse(text)
    expect(list.map((d) => d.type)).toEqual(['milk', 'diaper'])
    expect(list[1].time).toBe(at(15))
    expect(list[1].data).toEqual<DiaperData>({ kind: 'poop', color: 'yellow', texture: 'soft', volume: 'medium' })
    expect(list[0].note).toBe('三点喝了150毫升奶粉')
    expect(list[1].note).toBe('拉了一次黄色软便')
    expect(list.every((d) => d.raw === text)).toBe(true)
  })

  it('只有时间的子句只更新继承时间', () => {
    const d = one('下午三点，喝了150毫升奶')
    expect(d.time).toBe(at(15))
  })

  it('"又"也是分句符', () => {
    expect(parse('喝了120毫升奶又拉了').map((d) => d.type)).toEqual(['milk', 'diaper'])
  })

  it('相对时间：半小时前 / 两个小时前 / 十五分钟前', () => {
    expect(one('半小时前喝了奶').time).toBe(NOW - 30 * MIN)
    expect(one('两个小时前拉了').time).toBe(NOW - 120 * MIN)
    expect(one('十五分钟前吃了辅食').time).toBe(NOW - 15 * MIN)
  })

  it('语音识别常见的无标点长句：同句多类型', () => {
    const list = parse('三点喝了一百五十毫升奶粉拉了一次黄色软便')
    expect(list.map((d) => d.type)).toEqual(['milk', 'diaper'])
    expect(list.every((d) => d.time === at(15))).toBe(true)
    expect(parse('体温三十八度吃了美林').map((d) => d.type)).toEqual(['temp', 'medicine'])
  })

  it('"十分"作为分钟数时正常换算', () => {
    expect(cnToArabic('三点十分')).toBe('3:10')
    expect(one('睡了十分钟').endTime! - one('睡了十分钟').time).toBe(10 * MIN)
  })

  it('无法识别返回空数组', () => {
    expect(parse('哈哈哈今天天气不错')).toEqual([])
    expect(parse('')).toEqual([])
  })
})

/* ── 排便 ───────────────────────────────────────────────────────────────── */

describe('排便', () => {
  it('颜色 / 质地 / 量', () => {
    expect(one('拉了很多绿色的稀便').data).toEqual<DiaperData>({
      kind: 'poop', color: 'green', texture: 'loose', volume: 'large',
    })
  })

  it('大小便都有', () => {
    expect((one('大小便都有').data as DiaperData).kind).toBe('both')
  })

  it('相邻小便合并为一条', () => {
    const d = one('换尿布，尿了')
    expect(d.data).toEqual<DiaperData>({ kind: 'pee', color: null, texture: null, volume: null })
  })

  it('尿了，拉了 → 合并为大小便', () => {
    expect((one('尿了，拉了一点').data as DiaperData)).toEqual<DiaperData>({
      kind: 'both', color: null, texture: null, volume: 'small',
    })
  })

  it('否定句不记排便', () => {
    expect(parse('没拉')).toEqual([])
    expect((one('尿了但是没拉').data as DiaperData).kind).toBe('pee')
  })

  it('食材里的颜色字不影响大便颜色', () => {
    const list = parse('吃了蛋黄拉了绿色便便')
    const diaper = list.find((d) => d.type === 'diaper')
    expect((diaper?.data as DiaperData).color).toBe('green')
  })
})

/* ── 睡眠 ───────────────────────────────────────────────────────────────── */

describe('睡眠', () => {
  it('从两点睡到三点半 → 14:00 ~ 15:30', () => {
    const d = one('从两点睡到三点半')
    expect(d.type).toBe('sleep')
    expect([d.time, d.endTime]).toEqual([at(14), at(15, 30)])
  })

  it('下午一点睡到两点四十 + 续句睡眠质量', () => {
    const d = one('下午一点睡到两点四十，睡得很安稳')
    expect([d.time, d.endTime]).toEqual([at(13), at(14, 40)])
    expect((d.data as SleepData).quality).toBe('good')
  })

  it('跨夜：晚上九点睡到早上六点', () => {
    const d = one('晚上九点睡到早上六点')
    expect([d.time, d.endTime]).toEqual([at(21, 0, -1), at(6)])
  })

  it('睡了一个半小时 → 结束于 now', () => {
    const d = one('睡了一个半小时')
    expect([d.time, d.endTime]).toEqual([NOW - 90 * MIN, NOW])
  })

  it('睡了一个小时二十分钟', () => {
    const d = one('宝宝睡了一个小时二十分钟')
    expect(d.endTime! - d.time).toBe(80 * MIN)
  })

  it('刚睡着 → 进行中', () => {
    const d = one('刚睡着')
    expect([d.time, d.endTime]).toEqual([NOW, null])
  })

  it('三点睡着的，睡了一个小时 → 补全结束时间', () => {
    const d = one('三点睡着的，睡了一个小时')
    expect([d.time, d.endTime]).toEqual([at(15), at(16)])
  })

  it('睡了一个小时，三点半醒的 → 平移到醒来时刻', () => {
    const d = one('睡了一个小时，三点半醒的')
    expect([d.time, d.endTime]).toEqual([at(14, 30), at(15, 30)])
  })

  it('睡前喝奶不是睡眠记录', () => {
    expect(parse('睡前喝了200毫升奶').map((d) => d.type)).toEqual(['milk'])
  })
})

/* ── 辅食 ───────────────────────────────────────────────────────────────── */

describe('辅食', () => {
  it('南瓜泥半碗，很爱吃', () => {
    const d = one('吃了南瓜泥半碗，很爱吃')
    expect(d.data).toEqual<SolidData>({ foods: ['南瓜泥'], amount: '半碗', accept: 'like', reaction: '' })
  })

  it('拒绝 + 过敏反应', () => {
    const d = one('辅食吃了米粉，不爱吃，有点过敏起疹子')
    const data = d.data as SolidData
    expect(data.accept).toBe('refuse')
    expect(data.reaction).toBe('过敏')
    expect(data.amount).toBe('少量')
  })

  it('外部食材词表优先', () => {
    const d = one('吃了鳕鱼饼', NOW)
    expect((parse('吃了鳕鱼饼', NOW, ['鳕鱼饼'])[0].data as SolidData).foods).toEqual(['鳕鱼饼'])
    expect(d.type).toBe('solid')
  })

  it('"、"并列的多种食材', () => {
    expect((one('午饭吃了胡萝卜、土豆泥').data as SolidData).foods).toEqual(['胡萝卜', '土豆泥'])
  })
})

/* ── 体温 / 用药 / 成长 ──────────────────────────────────────────────────── */

describe('体温 / 用药 / 成长', () => {
  it('体温三十七度五，默认耳温', () => {
    expect(one('体温三十七度五').data).toEqual<TempData>({ value: 37.5, method: 'ear' })
  })

  it('腋下测温', () => {
    expect(one('腋下体温36.8度').data).toEqual<TempData>({ value: 36.8, method: 'armpit' })
  })

  it('维D 一粒', () => {
    expect(one('喂了一粒维D').data).toEqual<MedicineData>({ name: '维生素D', dose: '1粒' })
  })

  it('美林归一为退烧药，毫升不误判为奶量', () => {
    const list = parse('吃了美林2.5毫升')
    expect(list.map((d) => d.type)).toEqual(['medicine'])
    expect(list[0].data).toEqual<MedicineData>({ name: '退烧药', dose: '2.5毫升' })
  })

  it('不认识的药归为"其他"，原词保留在 note', () => {
    const d = one('喂了点蒙脱石散')
    expect((d.data as MedicineData).name).toBe('其他')
    expect(d.note).toContain('蒙脱石')
  })

  it('体重斤换算 + 身高合并为一条', () => {
    const d = one('体重十五斤，身高65厘米')
    expect(d.data).toEqual<GrowthData>({ weight: 7.5, height: 65, head: null })
  })
})

/* ── 契约：枚举值必须来自常量表 ─────────────────────────────────────────── */

describe('取值契约', () => {
  it('所有产出的枚举值都在常量表中', () => {
    const samples = [
      '拉了金黄色糊状便', '拉了黑色的硬便', '拉了带血丝的稀便有黏液', '拉肚子水样便',
      '喂了伊可新', '补铁', '补钙', '益生元一包', '吃了一口米糊', '吃了小半碗粥', '吃了大半碗面条', '吃了一碗饭',
    ]
    const colors = STOOL_COLORS.map((c) => c.value)
    const textures = STOOL_TEXTURES.map((c) => c.value)
    for (const d of samples.flatMap((s) => parse(s))) {
      if (d.type === 'diaper') {
        const data = d.data as DiaperData
        expect(data.color === null || colors.includes(data.color)).toBe(true)
        expect(data.texture === null || textures.includes(data.texture)).toBe(true)
      }
      if (d.type === 'medicine') {
        expect(MEDICINE_PRESETS).toContain((d.data as MedicineData).name)
      }
      if (d.type === 'solid') {
        expect(SOLID_AMOUNTS).toContain((d.data as SolidData).amount)
      }
    }
  })
})
