/* ============================================================================
 *  语音 / 文本 → 护理日志草稿 · Voice Parser
 * ----------------------------------------------------------------------------
 *  纯规则、零依赖、可离线：把"三点喝了一百五十毫升奶粉，拉了一次黄色软便"这类
 *  口语拆成结构化草稿，交由界面确认后入库。
 *
 *      原文 ─▶ 分句 ─▶ cnToArabic 规范化 ─▶ 时间解析 ─▶ 类型识别 ─▶ 字段抽取
 *                                                              │
 *            续句合并（"很爱吃" 补到上一条辅食、"150毫升" 补到上一条喂奶）◀─┘
 *
 *  约束：
 *    · 不使用正则后行断言（lookbehind），兼容 iOS 16.4 以下的 WebView；
 *    · 解析出的时间一律不晚于 now；
 *    · 子句只有时间（"下午三点，"）时仅更新"继承时间"，供后续子句沿用。
 * ========================================================================== */

import type {
  Accept, BreastSide, DiaperData, DiaperKind, GrowthData, LogDataMap, LogType, MedicineData,
  MilkData, SleepData, SleepQuality, SolidData, StoolVolume, TempData, TempMethod,
} from '@/shared/types'
import { MEDICINE_PRESETS, SOLID_AMOUNTS, STOOL_COLORS, STOOL_TEXTURES } from '@/shared/constants'

/* ── 对外类型 ───────────────────────────────────────────────────────────── */

export interface VoiceDraft<T extends LogType = LogType> {
  type: T
  time: number
  endTime: number | null
  data: LogDataMap[T]
  /** 产生该草稿的子句原文；续句合并时以"，"拼接 */
  note: string
  /** 整句原文 */
  raw: string
}

export interface ParseOptions {
  now?: number
  /** 外部食材词表（如素材库食材名），优先于内置词表匹配 */
  foods?: string[]
}

const MINUTE = 60000
const HOUR = 60 * MINUTE

/* ============================================================================
 *  ① 中文数字规范化
 * ========================================================================== */

const CN_DIGIT: Record<string, number> = {
  零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
}
const CN_UNIT: Record<string, number> = { 十: 10, 百: 100, 千: 1000 }
const CN_CHARS = '零〇一二两三四五六七八九十百千'
const CN_HOUR = '零〇一二两三四五六七八九十'
const CN_OR_NUM = `[${CN_CHARS}\\d]+`

/** 中文数字串 → 数值；支持口语尾数省略："一百五"=150、"二百四"=240、"十五"=15 */
function cnNum(s: string): number {
  if (/^\d+(\.\d+)?$/.test(s)) {
    return Number(s)
  }
  const chars = Array.from(s)
  if (!chars.some((c) => c in CN_UNIT)) {
    // 逐位读法："一五零" → 150、"零五" → 5
    return Number(chars.map((c) => (c in CN_DIGIT ? CN_DIGIT[c] : '')).join(''))
  }
  let total = 0
  let cur = 0
  let lastUnit = 1
  chars.forEach((c, i) => {
    if (c in CN_DIGIT) {
      cur = CN_DIGIT[c]
      return
    }
    const unit = CN_UNIT[c]
    total += (cur || (i === 0 ? 1 : 0)) * unit   // "十五" 省略了首位"一"
    lastUnit = unit
    cur = 0
  })
  if (cur) {
    // "一百零五" 的尾数是个位；"一百五" 的尾数是上一单位的十分之一
    total += chars[chars.length - 2] === '零' ? cur : (cur * lastUnit) / 10
  }
  return total
}

function toHalfWidth(s: string): string {
  return s
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/：/g, ':')
    .replace(/．/g, '.')
    .replace(/[～〜]/g, '~')
    .replace(/[Ｍｍ][Ｌｌ]/g, 'ml')
}

/** 含数字字、却不表示数量的固定词：规范化前替换为私有区占位符，结束后还原 */
const PROTECTED = [
  '一般', '一直', '一起', '一样', '一下', '一些', '一会', '一边', '一碗', '一口',
  '一共', '一定', '一切', '一阵', '统一', '万一', '千万', '两边', '两侧',
]
const hold = (i: number): string => String.fromCharCode(0xe000 + i)

/** 带单位的小数："七点五公斤" "三十七点五度" —— 必须先于时刻规则处理 */
const DECIMAL_RE = new RegExp(
  `(${CN_OR_NUM})点([零〇一二三四五六七八九\\d]+)(?=\\s*(?:公斤|千克|kg|斤|厘米|公分|cm|度|℃|毫升|ml|个?小时|个?钟头))`,
  'gi',
)

/** 时刻："三点半" "十点一刻" "两点四十" "九点零五" "3点20分" */
const CN_MINUTE = '[零〇][一二三四五六七八九]|[一二三四五]?十[一二三四五六七八九]?'
const CLOCK_RE = new RegExp(
  `(^|[^${CN_CHARS}\\d.])([${CN_HOUR}]{1,3}|\\d{1,2})点钟?` +
    `(半|一刻|三刻|(?:${CN_MINUTE}|\\d{1,2})(?![${CN_CHARS}\\d.]|\\s*(?:毫|ml|克|斤|度|公斤|厘米|分钟)))?` +
    '(?:分(?!钟))?',
  'gi',
)

function clockText(match: string, pre: string, h: string, min: string | undefined): string {
  const hour = cnNum(h)
  const minute = min === undefined ? 0
    : min === '半' ? 30
    : min === '一刻' ? 15
    : min === '三刻' ? 45
    : cnNum(min)
  if (hour > 24 || minute > 59) {
    return match
  }
  return `${pre}${hour}:${String(minute).padStart(2, '0')}`
}

export function cnToArabic(text: string): string {
  let s = toHalfWidth(text)

  // ① 量词"一点"→"少许"，避免被当成 1 点钟
  s = s.replace(/一点点|一点儿/g, '少许').replace(/(了|有|稍微|稍|就|吃|喝|拉|尿|好|差)一点/g, '$1少许')

  // ② 保护固定词
  PROTECTED.forEach((w, i) => {
    s = s.split(w).join(hold(i))
  })

  // ③ 带单位的小数
  s = s.replace(DECIMAL_RE, (_m, a: string, b: string) => {
    const frac = Array.from(b).map((c) => (c in CN_DIGIT ? CN_DIGIT[c] : c)).join('')
    return `${cnNum(a)}.${frac}`
  })

  // ④ 时长："一个半小时" "半小时" "两个钟头"
  s = s
    .replace(new RegExp(`(${CN_OR_NUM})个半(?:小时|钟头)`, 'g'), (_m, n: string) => `${cnNum(n)}.5小时`)
    .replace(/半个?(?:小时|钟头)/g, '0.5小时')
    .replace(new RegExp(`(${CN_OR_NUM})个(?:小时|钟头)`, 'g'), (_m, n: string) => `${cnNum(n)}小时`)
    .replace(/钟头/g, '小时')

  // ⑤ 时刻
  s = s.replace(CLOCK_RE, clockText)

  // ⑥ 其余中文数字
  s = s.replace(/[零〇一二两三四五六七八九十百千]+/g, (m) => String(cnNum(m)))

  // ⑦ 体温口语："37度5" → "37.5度"、"37度半" → "37.5度"
  s = s.replace(/(\d{2})度(\d)(?!\d)/g, '$1.$2度').replace(/(\d{2})度半/g, '$1.5度')

  // ⑧ 还原固定词
  PROTECTED.forEach((w, i) => {
    s = s.split(hold(i)).join(w)
  })
  return s
}

/* ============================================================================
 *  ② 分句与时间
 * ========================================================================== */

/** 注意不按"、"切分：它常用于食材并列（"南瓜、胡萝卜"） */
const SPLIT_RE = /[，,。；;！!？?\n\r]+|然后|接着|还有|又/

function splitClauses(text: string): string[] {
  return text.split(SPLIT_RE).map((c) => c.trim()).filter(Boolean)
}

const MOD = '凌晨|早上|早晨|清晨|上午|中午|下午|傍晚|晚上|夜里|夜间|半夜|深夜'
const RANGE_RE = new RegExp(`(${MOD})?(\\d{1,2}):(\\d{2})[^\\d:]{0,5}?(?:到|至|~|-|—)(${MOD})?(\\d{1,2}):(\\d{2})`)
const POINT_RE = new RegExp(`(${MOD})?(\\d{1,2}):(\\d{2})(?:多|左右|许)?`)
const AGO_RE = /(\d+(?:\.\d+)?)\s*小时(?:\s*(\d+)\s*分钟?)?\s*之?前|(\d+)\s*分钟\s*之?前/
const NOW_RE = /刚刚|刚才|现在|刚/
const DURATION_RE = /(\d+(?:\.\d+)?)\s*小时(?:\s*(\d+)\s*分(?:钟)?)?|(\d+(?:\.\d+)?)\s*分钟/

interface TimeInfo {
  point: number | null
  range: [number, number] | null
  /** 去掉时间表达后的文本，供数值抽取，避免"3:00"里的数字被误用 */
  rest: string
}

/** 按时段修饰词给出候选的 24 小时制钟点；无修饰且 1~11 点时有上下午两种可能 */
function hourCandidates(h: number, mod: string | undefined): number[] {
  if (h > 24) {
    return []
  }
  if (h === 24) {
    return [0]
  }
  if (h >= 13) {
    return [h]
  }
  if (!mod) {
    return h === 0 ? [0] : h === 12 ? [12, 0] : [h, h + 12]
  }
  if (mod === '凌晨') {
    return [h % 12]
  }
  if (/早|上午|清晨/.test(mod)) {
    return [h]
  }
  if (mod === '中午') {
    return [h >= 11 ? h : h + 12]
  }
  if (/下午|傍晚/.test(mod)) {
    return [h === 12 ? 12 : h + 12]
  }
  // 晚上 / 夜里 / 半夜：12 点是午夜，凌晨 1~5 点保持原值
  return [h === 12 ? 0 : h < 6 ? h : h + 12]
}

function at(base: number, dayOffset: number, h: number, m: number): number {
  const d = new Date(base)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + dayOffset, h, m).getTime()
}

/** 在今天 / 昨天的候选时刻里，取不晚于 now 的最近一个 */
function resolvePoint(h: number, m: number, mod: string | undefined, now: number): number | null {
  if (m > 59) {
    return null
  }
  let best: number | null = null
  for (const hh of hourCandidates(h, mod)) {
    for (const off of [0, -1]) {
      const t = at(now, off, hh, m)
      if (t <= now && (best === null || t > best)) {
        best = t
      }
    }
  }
  return best
}

/** 起止时刻：结束取开始后 16 小时内最早的候选；优先选"结束不晚于 now"且最近的一组 */
function resolveRange(
  sh: number, sm: number, smod: string | undefined,
  eh: number, em: number, emod: string | undefined,
  now: number,
): [number, number] | null {
  if (sm > 59 || em > 59) {
    return null
  }
  let best: [number, number] | null = null
  let fallback: [number, number] | null = null
  for (const hh of hourCandidates(sh, smod)) {
    for (const off of [0, -1]) {
      const start = at(now, off, hh, sm)
      if (start > now) {
        continue
      }
      let end: number | null = null
      for (const ehh of hourCandidates(eh, emod)) {
        for (const eoff of [0, 1]) {
          const t = at(start, eoff, ehh, em)
          if (t > start && t - start <= 16 * HOUR && (end === null || t < end)) {
            end = t
          }
        }
      }
      if (end === null) {
        continue
      }
      if (end <= now) {
        if (best === null || end > best[1]) {
          best = [start, end]
        }
      } else if (fallback === null || start > fallback[0]) {
        fallback = [start, end]
      }
    }
  }
  return best ?? fallback
}

function parseTime(norm: string, now: number): TimeInfo {
  let rest = norm
  let point: number | null = null
  let range: [number, number] | null = null

  const r = RANGE_RE.exec(rest)
  if (r) {
    range = resolveRange(Number(r[2]), Number(r[3]), r[1], Number(r[5]), Number(r[6]), r[4], now)
    if (range) {
      rest = rest.replace(r[0], ' ')
    }
  }
  if (!range) {
    const p = POINT_RE.exec(rest)
    if (p) {
      point = resolvePoint(Number(p[2]), Number(p[3]), p[1], now)
      if (point !== null) {
        rest = rest.replace(p[0], ' ')
      }
    }
  }
  if (!range && point === null) {
    const a = AGO_RE.exec(rest)
    if (a) {
      const minutes = a[3] ? Number(a[3]) : Number(a[1]) * 60 + Number(a[2] ?? 0)
      point = now - Math.round(minutes * MINUTE)
      rest = rest.replace(a[0], ' ')
    }
  }
  if (!range && point === null && NOW_RE.test(rest)) {
    point = now
  }
  return { point, range, rest }
}

/** 时长（分钟）；"N分钟前"已在 parseTime 中剔除 */
function parseDuration(rest: string): number | null {
  const m = DURATION_RE.exec(rest)
  if (!m) {
    return null
  }
  return m[3] ? Math.round(Number(m[3])) : Math.round(Number(m[1]) * 60 + Number(m[2] ?? 0))
}

/* ============================================================================
 *  ③ 词表与识别规则
 * ========================================================================== */

/** 易混淆词：识别前替换为占位，避免"睡前"→睡眠、"拉坐"→排便、"左右"→左侧 */
const NOISE_RE = /睡觉前|睡醒后|醒来后|睡前|醒后|尿布疹|拉坐|拉手|拉着|拉起|拉住|方便|顺便|随便|便宜|感觉|觉得|左右|白天|明白/g
/** 仅对喂奶识别生效：酸奶、奶酪是辅食，奶奶是人 */
const MILK_NOISE_RE = /奶奶|酸奶|奶酪|奶片|奶昔|奶嘴|奶糕|吐奶|溢奶|呛奶/g
/** 仅对大便性状生效：食材名里的颜色 / 质地字 */
const STOOL_NOISE_RE = /蛋黄|黄瓜|黄桃|绿豆|黑米|黑芝麻|白菜|白粥|蛋白|米糊|软饭|香蕉|水果/g

const MILK_STRONG_RE = /配方奶|奶粉|母乳|亲喂|瓶喂|喂奶|夜奶|吃奶|喝奶|奶瓶|牛奶|吸吮|奶水/
const ML_RE = /(\d+(?:\.\d+)?)\s*(?:毫升|ml|毫(?![米克]))/i
const SOLID_RE = /辅食|米粉|米糊|泥|粥|面条|面片|蛋黄|蛋羹|软饭|米饭|馒头|饼干|溶豆|泡芙|水果|蔬菜|酸奶|奶酪|手指食物/
const EAT_RE = /吃|喂/
const SOLID_PORTION_RE = /尝|一口|几口|碗|\d+勺|几勺/
const PEE_RE = /尿|小便|嘘嘘|湿了/
const POOP_RE = /拉|大便|便便|粑粑|臭臭|屎|便/
const BOTH_RE = /大小便|屎尿|尿.{0,3}拉|拉.{0,3}尿/
const DIAPER_NEG_RE = /没有?(?:拉|大便|便便|尿|小便|排便)|未(?:排便|大便)|便秘/g
const SLEEP_RE = /睡|眠/
const ONGOING_RE = /睡着|入睡|在睡|睡下|哄睡|开始睡|去睡|睡觉|午睡|小睡|睡了/
const WAKE_RE = /醒/
const TEMP_RE = /体温|发烧|发热|低烧|高烧|烧到|耳温|额温|腋温|肛温|摄氏/
const TEMP_UNIT_RE = /\d(?:\.\d)?\s*(?:度|℃)/
const MEDICINE_RE = /维生素|维AD|维D|伊可新|星鲨|VD|D3|AD|益生菌|妈咪爱|益生元|铁剂|补铁|钙|退烧|美林|泰诺林|布洛芬|对乙酰氨基酚|蒙脱石|思密达|药/i
const DOSE_RE = /\d+(?:\.\d+)?\s*(?:滴|粒|毫升|ml|包|袋|片|毫克|mg|克|支|勺)/i
const GROWTH_RE = /体重|身高|身长|头围/

type Rule = [RegExp, string]

const COLOR_RULES: Rule[] = [
  [/金黄/, 'golden'], [/黄/, 'yellow'], [/绿/, 'green'], [/褐|棕|咖啡/, 'brown'],
  [/黑/, 'black'], [/血/, 'red'], [/灰白|白/, 'white'],
]
const TEXTURE_RULES: Rule[] = [
  [/水样|水状|蛋花|拉肚子|腹泻/, 'watery'], [/黏液|粘液|鼻涕/, 'mucus'], [/稀/, 'loose'],
  [/糊/, 'paste'], [/软/, 'soft'], [/成形|条状/, 'formed'], [/干|硬|颗粒|羊屎/, 'hard'],
]
const MEDICINE_RULES: Rule[] = [
  [/维生素AD|维AD|伊可新|AD/i, '维生素AD'],
  [/维生素D|维D|VD|D3|星鲨/i, '维生素D'],
  [/益生菌|妈咪爱/, '益生菌'],
  [/益生元/, '益生元'],
  [/铁/, '铁剂'],
  [/钙/, '钙剂'],
  [/退烧|美林|泰诺林|布洛芬|对乙酰氨基酚/, '退烧药'],
]
const PORTION_RULES: Rule[] = [
  [/尝|一口|几口/, '尝一口'], [/小半碗/, '小半碗'], [/大半碗/, '大半碗'], [/半碗/, '半碗'],
  [/一碗|1碗|整碗|满碗/, '一碗'], [/少量|少许|\d+勺|几勺/, '少量'],
]
const REACTIONS = ['过敏', '起疹', '红疹', '呕吐', '腹泻']

const COLOR_VALUES = STOOL_COLORS.map((c) => c.value)
const TEXTURE_VALUES = STOOL_TEXTURES.map((c) => c.value)

/** 规则命中后再校验取值属于常量表，保证与界面、汇报的枚举一致 */
function pick(text: string, rules: Rule[], allowed: readonly string[]): string | null {
  const hit = rules.find(([re]) => re.test(text))
  return hit && allowed.includes(hit[1]) ? hit[1] : null
}

const BUILTIN_FOODS = [
  '米粉', '米糊', '小米粥', '大米粥', '粥', '面条', '面片', '馒头', '米饭', '软饭', '燕麦', '小米',
  '南瓜', '胡萝卜', '土豆', '红薯', '紫薯', '山药', '西兰花', '菠菜', '青菜', '小白菜', '白菜', '番茄',
  '西红柿', '豌豆', '玉米', '黄瓜', '冬瓜', '茄子', '香菇',
  '苹果', '香蕉', '梨', '牛油果', '蓝莓', '草莓', '火龙果', '猕猴桃', '橙子', '西瓜', '葡萄', '桃子',
  '芒果', '木瓜', '哈密瓜',
  '蛋黄', '鸡蛋', '蛋羹', '猪肉', '牛肉', '鸡肉', '羊肉', '肉泥', '猪肝', '鸡肝', '肝泥', '鳕鱼',
  '三文鱼', '鲈鱼', '鱼肉', '虾仁', '虾', '豆腐', '酸奶', '奶酪', '饼干', '溶豆', '泡芙',
]
const TEXTURE_SUFFIX = '泥糊粥汁羹条丁块片末饭面'

/** 食材匹配：长词优先、互不重叠；紧跟质地字时并入（南瓜 + 泥 → 南瓜泥） */
function matchFoods(text: string, extra: string[]): string[] {
  const vocab = Array.from(new Set([...extra, ...BUILTIN_FOODS].map((w) => w.trim()).filter(Boolean)))
    .sort((a, b) => b.length - a.length)
  const taken: boolean[] = new Array<boolean>(text.length).fill(false)
  const hits: { at: number; name: string }[] = []
  for (const word of vocab) {
    for (let at = text.indexOf(word); at >= 0; at = text.indexOf(word, at + word.length)) {
      if (taken.slice(at, at + word.length).some(Boolean)) {
        continue
      }
      const suffix = text.charAt(at + word.length)
      const name = suffix && TEXTURE_SUFFIX.includes(suffix) && !word.endsWith(suffix) && !taken[at + word.length]
        ? word + suffix
        : word
      taken.fill(true, at, at + name.length)
      hits.push({ at, name })
    }
  }
  return Array.from(new Set(hits.sort((a, b) => a.at - b.at).map((h) => h.name)))
}

/* ============================================================================
 *  ④ 字段抽取
 * ========================================================================== */

interface Analysis {
  /** 子句原文 */
  clause: string
  /** 规范化文本：食材匹配用 */
  norm: string
  /** 去噪文本：关键词识别用 */
  det: string
  time: TimeInfo
}

function firstNumber(text: string, min: number, max: number): number | null {
  for (const m of text.matchAll(/\d+(?:\.\d+)?/g)) {
    const v = Number(m[0])
    if (v >= min && v <= max) {
      return v
    }
  }
  return null
}

function mlOf(a: Analysis): number | null {
  const m = ML_RE.exec(a.time.rest)
  return m ? Number(m[1]) : null
}

function sideOf(det: string): BreastSide | null {
  const left = det.includes('左')
  const right = det.includes('右')
  if (/两边|两侧|双侧|双边/.test(det) || (left && right)) {
    return 'both'
  }
  return left ? 'left' : right ? 'right' : null
}

function milkData(a: Analysis): MilkData {
  const ml = mlOf(a)
  const range = a.time.range
  const duration = parseDuration(a.time.rest) ?? (range ? Math.round((range[1] - range[0]) / MINUTE) : null)
  const side = sideOf(a.det)
  const direct = /亲喂|直接喂|吸吮|亲母乳/.test(a.det) || (ml === null && (duration !== null || side !== null))
  if (direct) {
    return { mode: 'breast', amount: null, duration, side }
  }
  // 口语常省略单位："喝了150" —— 仅在喂奶语境下把 10~400 的裸数当作奶量
  const amount = ml ?? firstNumber(a.time.rest.replace(/\d+\s*次/g, ' '), 10, 400)
  return { mode: /母乳|奶水/.test(a.det) ? 'bottle_breast' : 'formula', amount, duration: null, side: null }
}

function solidPortion(det: string): string | null {
  return pick(det, PORTION_RULES, SOLID_AMOUNTS)
}

function solidAccept(det: string): Accept | null {
  if (/不爱吃|不吃|不喜欢|不肯|拒绝|抗拒|吐出|吐了/.test(det)) {
    return 'refuse'
  }
  if (/爱吃|喜欢|吃光|吃完|光盘|吃得香|吃得很香|吃得很好|都吃了|全吃了|吃干净/.test(det)) {
    return 'like'
  }
  return /一般/.test(det) ? 'normal' : null
}

function solidReaction(det: string): string {
  return REACTIONS.find((w) => det.includes(w)) ?? ''
}

function solidData(a: Analysis, foods: string[]): SolidData {
  return {
    foods: matchFoods(a.norm, foods),
    amount: solidPortion(a.det) ?? '少量',
    accept: solidAccept(a.det) ?? 'normal',
    reaction: solidReaction(a.det),
  }
}

function stoolVolume(text: string): StoolVolume | null {
  if (/不多|少/.test(text)) {
    return 'small'
  }
  return /多|大量/.test(text) ? 'large' : null
}

function diaperData(a: Analysis): DiaperData | null {
  const text = a.det.replace(DIAPER_NEG_RE, '·')
  const both = BOTH_RE.test(text)
  const pee = both || PEE_RE.test(text)
  const poop = both || POOP_RE.test(text.replace(/小便/g, '·'))
  if (!pee && !poop) {
    return null
  }
  const kind: DiaperKind = pee && poop ? 'both' : poop ? 'poop' : 'pee'
  const stool = text.replace(STOOL_NOISE_RE, '·')
  return {
    kind,
    color: poop ? pick(stool, COLOR_RULES, COLOR_VALUES) : null,
    texture: poop ? pick(stool, TEXTURE_RULES, TEXTURE_VALUES) : null,
    volume: stoolVolume(stool) ?? (poop ? 'medium' : null),
  }
}

type SleepMode = 'range' | 'duration' | 'ongoing'

function sleepMode(a: Analysis, duration: number | null): SleepMode | null {
  if (!SLEEP_RE.test(a.det)) {
    return null
  }
  if (a.time.range) {
    return 'range'
  }
  if (duration !== null) {
    return 'duration'
  }
  return ONGOING_RE.test(a.det) ? 'ongoing' : null
}

function sleepQuality(det: string): SleepQuality | null {
  if (/哭/.test(det) || /闹觉/.test(det)) {
    return 'cry'
  }
  if (/易醒|醒了?(?:\d+|几|好几)次|醒来(?:\d+|几|好几)次|不踏实|翻来覆去|惊醒|不安稳/.test(det)) {
    return 'restless'
  }
  return /安稳|睡得好|睡得很好|睡得香|睡得很香|踏实|香甜/.test(det) ? 'good' : null
}

function tempMethod(det: string): TempMethod | null {
  if (/腋|夹/.test(det)) {
    return 'armpit'
  }
  if (/肛/.test(det)) {
    return 'rectal'
  }
  if (/额|脑门/.test(det)) {
    return 'forehead'
  }
  return /耳/.test(det) ? 'ear' : null
}

function tempData(a: Analysis): TempData | null {
  if (!TEMP_RE.test(a.det) && !TEMP_UNIT_RE.test(a.time.rest)) {
    return null
  }
  const value = firstNumber(a.time.rest, 34, 43)
  return value === null ? null : { value, method: tempMethod(a.det) ?? 'ear' }
}

function doseOf(a: Analysis): string {
  const m = DOSE_RE.exec(a.time.rest)
  return m ? m[0].replace(/\s+/g, '') : ''
}

function medicineData(a: Analysis): MedicineData | null {
  if (!MEDICINE_RE.test(a.det)) {
    return null
  }
  return { name: pick(a.det, MEDICINE_RULES, MEDICINE_PRESETS) ?? '其他', dose: doseOf(a) }
}

function growthData(a: Analysis): GrowthData | null {
  if (!GROWTH_RE.test(a.det)) {
    return null
  }
  const rest = a.time.rest
  const w = /(?:体重|称重)\D{0,3}?(\d+(?:\.\d+)?)\s*(公斤|千克|kg|斤)?/i.exec(rest)
  const h = /(?:身高|身长)\D{0,3}?(\d+(?:\.\d+)?)/.exec(rest)
  const c = /头围\D{0,3}?(\d+(?:\.\d+)?)/.exec(rest)
  const data: GrowthData = {
    weight: w ? Math.round((w[2] === '斤' ? Number(w[1]) / 2 : Number(w[1])) * 100) / 100 : null,
    height: h ? Number(h[1]) : null,
    head: c ? Number(c[1]) : null,
  }
  return data.weight === null && data.height === null && data.head === null ? null : data
}

/* ============================================================================
 *  ⑤ 草稿组装
 * ========================================================================== */

interface Built {
  list: VoiceDraft[]
  /** 仅凭"N毫升"兜底识别为喂奶：若能补到上一条草稿则优先合并 */
  fallback: boolean
}

function buildDrafts(a: Analysis, base: number, raw: string, foods: string[]): Built {
  const list: VoiceDraft[] = []
  const add = <T extends LogType>(type: T, data: LogDataMap[T], time = base, endTime: number | null = null): void => {
    list.push({ type, time, endTime, data, note: a.clause, raw })
  }

  const detMilk = a.det.replace(MILK_NOISE_RE, '·')
  const hasMl = ML_RE.test(a.time.rest)
  const solid = SOLID_RE.test(a.norm)
    || matchFoods(a.norm, foods).length > 0
    || (EAT_RE.test(a.det) && SOLID_PORTION_RE.test(a.det))
  let milk = MILK_STRONG_RE.test(detMilk) || (detMilk.includes('奶') && (hasMl || /吃|喝|喂/.test(detMilk)))
  // "奶粉冲米粉"：没有奶量、也没有喝 / 亲喂 → 视为辅食的一部分
  if (milk && solid && !hasMl && !/喝|亲喂|母乳|夜奶/.test(detMilk)) {
    milk = false
  }

  if (milk) {
    add('milk', milkData(a))
  }
  if (solid) {
    add('solid', solidData(a, foods))
  }
  const diaper = diaperData(a)
  if (diaper) {
    add('diaper', diaper)
  }
  // 同句既有喂奶又有时长时（"亲喂15分钟睡着了"），时长归喂奶
  const duration = parseDuration(a.time.rest)
  const mode = sleepMode(a, milk ? null : duration)
  if (mode) {
    const data: SleepData = { quality: sleepQuality(a.det) }
    if (mode === 'range' && a.time.range) {
      add('sleep', data, a.time.range[0], a.time.range[1])
    } else if (mode === 'duration' && duration !== null) {
      add('sleep', data, base - duration * MINUTE, base)
    } else {
      add('sleep', data, base, null)
    }
  }
  const temp = tempData(a)
  if (temp) {
    add('temp', temp)
  }
  const medicine = medicineData(a)
  if (medicine) {
    add('medicine', medicine)
  }
  const growth = growthData(a)
  if (growth) {
    add('growth', growth)
  }

  if (!list.length && hasMl) {
    add('milk', milkData(a))
    return { list, fallback: true }
  }
  return { list, fallback: false }
}

/** 续句合并：本句没有新类型时，把属性补到上一条草稿；有任何补充则返回 true */
function mergeInto(last: VoiceDraft, a: Analysis, foods: string[]): boolean {
  let changed = false
  const fill = <T extends object, K extends keyof T>(obj: T, key: K, value: T[K] | null | undefined, force = false): void => {
    if (value !== null && value !== undefined && (force || obj[key] === null) && obj[key] !== value) {
      obj[key] = value
      changed = true
    }
  }

  switch (last.type) {
    case 'milk': {
      const d = last.data as MilkData
      if (d.mode === 'breast') {
        fill(d, 'duration', parseDuration(a.time.rest))
        fill(d, 'side', sideOf(a.det))
      } else {
        fill(d, 'amount', mlOf(a))
      }
      break
    }
    case 'solid': {
      const d = last.data as SolidData
      fill(d, 'amount', solidPortion(a.det), true)
      fill(d, 'accept', solidAccept(a.det), true)
      fill(d, 'reaction', solidReaction(a.det) || null, true)
      const more = matchFoods(a.norm, foods).filter((f) => !d.foods.includes(f))
      if (more.length) {
        d.foods = [...d.foods, ...more]
        changed = true
      }
      break
    }
    case 'diaper': {
      const d = last.data as DiaperData
      if (d.kind !== 'pee') {
        const stool = a.det.replace(STOOL_NOISE_RE, '·')
        fill(d, 'color', pick(stool, COLOR_RULES, COLOR_VALUES))
        fill(d, 'texture', pick(stool, TEXTURE_RULES, TEXTURE_VALUES))
      }
      fill(d, 'volume', stoolVolume(a.det), true)
      break
    }
    case 'sleep': {
      const d = last.data as SleepData
      fill(d, 'quality', sleepQuality(a.det), true)
      const point = a.time.point
      if (WAKE_RE.test(a.det) && point !== null) {
        // "睡了一个小时，三点半醒的"：保持时长，整体平移到醒来时刻
        if (last.endTime !== null) {
          last.time = point - (last.endTime - last.time)
          last.endTime = point
          changed = true
        } else if (point > last.time) {
          last.endTime = point
          changed = true
        }
      } else if (last.endTime === null && point === null && !a.time.range) {
        // "三点睡着的，睡了一个小时"：补全进行中的睡眠
        const duration = parseDuration(a.time.rest)
        if (duration !== null) {
          last.endTime = last.time + duration * MINUTE
          changed = true
        }
      }
      break
    }
    case 'temp': {
      fill(last.data as TempData, 'method', tempMethod(a.det), true)
      break
    }
    case 'medicine': {
      const d = last.data as MedicineData
      if (!d.dose) {
        const dose = doseOf(a)
        if (dose) {
          d.dose = dose
          changed = true
        }
      }
      break
    }
    case 'growth': {
      const g = growthData(a)
      if (g) {
        const d = last.data as GrowthData
        fill(d, 'weight', g.weight)
        fill(d, 'height', g.height)
        fill(d, 'head', g.head)
      }
      break
    }
    default:
      break
  }
  return changed
}

/** 相邻同时刻的排便 / 成长草稿合并为一条（"换尿布，尿了" / "体重…，身高…"） */
function coalesce(prev: VoiceDraft, next: VoiceDraft): boolean {
  if (prev.type !== next.type || prev.time !== next.time) {
    return false
  }
  if (prev.type === 'diaper') {
    const p = prev.data as DiaperData
    const n = next.data as DiaperData
    const pee = p.kind !== 'poop' || n.kind !== 'poop'
    const poop = p.kind !== 'pee' || n.kind !== 'pee'
    p.kind = pee && poop ? 'both' : poop ? 'poop' : 'pee'
    p.color = p.color ?? n.color
    p.texture = p.texture ?? n.texture
    p.volume = p.volume ?? n.volume ?? (poop ? 'medium' : null)
  } else if (prev.type === 'growth') {
    const p = prev.data as GrowthData
    const n = next.data as GrowthData
    p.weight = p.weight ?? n.weight
    p.height = p.height ?? n.height
    p.head = p.head ?? n.head
  } else {
    return false
  }
  prev.note = `${prev.note}，${next.note}`
  return true
}

/* ============================================================================
 *  ⑥ 入口
 * ========================================================================== */

export function parseVoice(text: string, opts: ParseOptions = {}): VoiceDraft[] {
  const now = opts.now ?? Date.now()
  const foods = opts.foods ?? []
  const drafts: VoiceDraft[] = []
  let inherited = now

  for (const clause of splitClauses(text)) {
    const norm = cnToArabic(clause)
    const time = parseTime(norm, now)
    const a: Analysis = { clause, norm, det: norm.replace(NOISE_RE, '·'), time }
    const base = time.range ? time.range[0] : time.point ?? inherited
    inherited = time.range ? time.range[1] : time.point ?? inherited

    const { list, fallback } = buildDrafts(a, base, text, foods)
    const last = drafts.length ? drafts[drafts.length - 1] : null
    const extendsSleep = list.length === 1 && list[0].type === 'sleep'
      && last?.type === 'sleep' && last.endTime === null && time.point === null && !time.range
    if (last && (!list.length || fallback || extendsSleep) && mergeInto(last, a, foods)) {
      last.note = `${last.note}，${clause}`
      continue
    }
    for (const draft of list) {
      const prev = drafts.length ? drafts[drafts.length - 1] : null
      if (!prev || !coalesce(prev, draft)) {
        drafts.push(draft)
      }
    }
  }
  return drafts
}
