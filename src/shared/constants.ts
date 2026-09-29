/* ============================================================================
 *  展示常量 · Labels & Palettes
 * ----------------------------------------------------------------------------
 *  所有"枚举 → 中文 / 图标 / 颜色"的映射集中于此，界面、汇报文本、云端消息
 *  共用同一份，避免同一概念在不同页面出现不同叫法。
 * ========================================================================== */

import type {
  Accept, BreastSide, DiaperKind, EduCategory, FeedKind, LogType, MilkMode,
  Rating, Relation, SleepQuality, Slot, StoolVolume, TempMethod,
} from './types'

/* ── 身份 ───────────────────────────────────────────────────────────────── */

export const RELATION_LABEL: Record<Relation, string> = {
  nanny: '育儿嫂',
  father: '爸爸',
  mother: '妈妈',
}

export const RELATION_AVATAR: Record<Relation, string> = {
  nanny: '👩‍🍼',
  father: '👨',
  mother: '👩',
}

export const RELATION_COLOR: Record<Relation, string> = {
  nanny: '#FF7E67',
  father: '#4F9DF7',
  mother: '#F76DAA',
}

/* ── 日志类型 ───────────────────────────────────────────────────────────── */

export interface LogKindMeta {
  label: string
  icon: string
  color: string
}

export const LOG_KINDS: Record<LogType, LogKindMeta> = {
  milk:     { label: '奶量', icon: '🍼', color: '#5AA9F8' },
  solid:    { label: '辅食', icon: '🥣', color: '#FFAA45' },
  diaper:   { label: '排便', icon: '💩', color: '#B8895B' },
  sleep:    { label: '睡眠', icon: '😴', color: '#8E7CF3' },
  temp:     { label: '体温', icon: '🌡️', color: '#FF6B6B' },
  medicine: { label: '用药', icon: '💊', color: '#37C2A0' },
  growth:   { label: '成长', icon: '📏', color: '#6CC35F' },
  other:    { label: '其他', icon: '📝', color: '#9AA3AE' },
}

export const LOG_TYPES = Object.keys(LOG_KINDS) as LogType[]

export const MILK_MODE_LABEL: Record<MilkMode, string> = {
  formula: '配方奶',
  bottle_breast: '母乳瓶喂',
  breast: '母乳亲喂',
}

export const BREAST_SIDE_LABEL: Record<BreastSide, string> = {
  left: '左侧',
  right: '右侧',
  both: '双侧',
}

export const ACCEPT_LABEL: Record<Accept, string> = {
  like: '爱吃',
  normal: '一般',
  refuse: '拒绝',
}

export const DIAPER_KIND_LABEL: Record<DiaperKind, string> = {
  pee: '小便',
  poop: '大便',
  both: '大小便',
}

/** 大便颜色：abnormal 用于汇报与消息中的异常提醒 */
export const STOOL_COLORS: { value: string; label: string; hex: string; abnormal: boolean }[] = [
  { value: 'yellow', label: '黄色', hex: '#E8B83A', abnormal: false },
  { value: 'golden', label: '金黄', hex: '#F2A516', abnormal: false },
  { value: 'green', label: '绿色', hex: '#7BA23F', abnormal: false },
  { value: 'brown', label: '褐色', hex: '#8B5A2B', abnormal: false },
  { value: 'black', label: '黑色', hex: '#2B2B2B', abnormal: true },
  { value: 'red', label: '带血丝', hex: '#D64545', abnormal: true },
  { value: 'white', label: '灰白', hex: '#D9D4C7', abnormal: true },
]

export const STOOL_TEXTURES: { value: string; label: string; abnormal: boolean }[] = [
  { value: 'watery', label: '水样', abnormal: true },
  { value: 'loose', label: '稀', abnormal: false },
  { value: 'paste', label: '糊状', abnormal: false },
  { value: 'soft', label: '软便', abnormal: false },
  { value: 'formed', label: '成形', abnormal: false },
  { value: 'hard', label: '干硬', abnormal: true },
  { value: 'mucus', label: '带黏液', abnormal: true },
]

export const STOOL_VOLUME_LABEL: Record<StoolVolume, string> = {
  small: '少量',
  medium: '中等',
  large: '较多',
}

export const SLEEP_QUALITY_LABEL: Record<SleepQuality, string> = {
  good: '安稳',
  restless: '易醒',
  cry: '哭闹',
}

export const TEMP_METHOD_LABEL: Record<TempMethod, string> = {
  ear: '耳温',
  forehead: '额温',
  armpit: '腋温',
  rectal: '肛温',
}

/** 发热阈值（℃）：腋温偏低、肛温偏高，按测量方式区分 */
export const FEVER_LINE: Record<TempMethod, number> = {
  ear: 37.8,
  forehead: 37.5,
  armpit: 37.3,
  rectal: 38.0,
}

export const MEDICINE_PRESETS = ['维生素D', '维生素AD', '益生菌', '铁剂', '钙剂', '退烧药', '益生元', '其他']

export const SOLID_AMOUNTS = ['尝一口', '少量', '小半碗', '半碗', '大半碗', '一碗']

/* ── 计划 ───────────────────────────────────────────────────────────────── */

export interface CategoryMeta {
  label: string
  icon: string
  color: string
  desc: string
}

export const EDU_CATEGORIES: Record<EduCategory, CategoryMeta> = {
  gross:    { label: '大运动',   icon: '🤸', color: '#FF8A65', desc: '抬头、翻身、坐、爬、站、走、跑跳' },
  fine:     { label: '精细动作', icon: '✋', color: '#F5A623', desc: '抓握、传递、捏取、手眼协调' },
  sensory:  { label: '感官认知', icon: '👀', color: '#3FA9E8', desc: '视听触觉、物体恒存、分类配对' },
  language: { label: '语言启蒙', icon: '🗣️', color: '#8E7CF3', desc: '发音、理解、表达、亲子阅读' },
  social:   { label: '亲子社交', icon: '🤗', color: '#F76DAA', desc: '依恋、情绪、模仿、互动规则' },
}

export const EDU_KEYS = Object.keys(EDU_CATEGORIES) as EduCategory[]

export const FEED_KIND_META: Record<FeedKind, { label: string; icon: string }> = {
  milk: { label: '喂奶', icon: '🍼' },
  solid: { label: '辅食', icon: '🥣' },
  supplement: { label: '补剂', icon: '💊' },
  water: { label: '喝水', icon: '💧' },
}

export const SLOT_LABEL: Record<Slot, string> = {
  day: '日间',
  evening: '晚间',
}

export const RATINGS: { value: Rating; label: string; icon: string }[] = [
  { value: 4, label: '很棒', icon: '🤩' },
  { value: 3, label: '不错', icon: '😊' },
  { value: 2, label: '一般', icon: '😐' },
  { value: 1, label: '不配合', icon: '😣' },
]

export const RATING_LABEL = Object.fromEntries(RATINGS.map((r) => [r.value, r.label])) as Record<Rating, string>
export const RATING_ICON = Object.fromEntries(RATINGS.map((r) => [r.value, r.icon])) as Record<Rating, string>

export const PERFORMANCE_TAGS = ['专注', '开心', '主动尝试', '有进步', '坚持完成', '兴趣不大', '容易分心', '哭闹', '犯困']

/** 消息与作者标签里的称呼：育儿嫂用昵称（王阿姨），家长用关系（妈妈） */
export function memberLabel(m: { relation: Relation; nickname: string }): string {
  return m.relation === 'nanny' ? m.nickname || RELATION_LABEL.nanny : RELATION_LABEL[m.relation]
}
