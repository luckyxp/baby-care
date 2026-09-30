/* ============================================================================
 *  领域模型 · Domain Model
 * ----------------------------------------------------------------------------
 *  这里是"云端 ⇄ 客户端"共享的唯一契约。未来接入真实后端时，服务端 DTO 与本文件
 *  一一对应即可，前端其余代码无需改动。
 *
 *  约定：
 *    · 所有家庭域实体共享 BaseEntity 信封字段，seq 由云端按家庭单调递增分配；
 *    · 实体从不物理删除，统一以 deleted=1 的"墓碑"随变更流下发；
 *    · DateKey 一律为本地时区的 'YYYY-MM-DD'，时间戳一律为毫秒。
 * ========================================================================== */

export type ID = string
export type DateKey = string

/* ── 身份与成员 ─────────────────────────────────────────────────────────── */

/** admin = 育儿嫂（管理员），parent = 家长 */
export type Role = 'admin' | 'parent'
export type Relation = 'nanny' | 'father' | 'mother'

export interface BaseEntity {
  id: ID
  familyId: ID
  createdBy: ID
  createdAt: number
  updatedBy: ID
  updatedAt: number
  deleted: 0 | 1
  /** 云端变更序号；0 表示尚未被云端确认（本地乐观写入） */
  seq: number
}

export interface UserProfile {
  id: ID
  phone: string
  nickname: string
  avatar: string
}

export interface Family {
  id: ID
  name: string
  ownerId: ID
  seq: number
  createdAt: number
}

export interface Member extends BaseEntity {
  userId: ID
  role: Role
  relation: Relation
  nickname: string
  avatar: string
}

export interface Invite extends BaseEntity {
  code: string
  relation: Exclude<Relation, 'nanny'>
  expiresAt: number
  usedBy: ID | null
  usedAt: number | null
}

/* ── 宝宝档案 ───────────────────────────────────────────────────────────── */

export type Gender = 'boy' | 'girl'
export type FeedingMode = 'breast' | 'formula' | 'mixed'
export type FeedKind = 'milk' | 'solid' | 'supplement' | 'water'

/** 一条喂养作息：计划模块据此生成每日喂养任务 */
export interface ScheduleSlot {
  time: string            // 'HH:mm'
  kind: FeedKind
  title: string
  amount: number | null   // ml；辅食/补剂为 null
}

export interface Baby extends BaseEntity {
  name: string
  gender: Gender
  birthday: DateKey
  feedingMode: FeedingMode
  birthWeight: number | null   // kg
  birthHeight: number | null   // cm
  allergies: string
  avatar: string
  /** 育儿嫂保存的默认喂养作息；null 表示沿用月龄方案 */
  schedule: ScheduleSlot[] | null
}

/* ── 护理日志 ───────────────────────────────────────────────────────────── */

export type LogType = 'milk' | 'solid' | 'diaper' | 'sleep' | 'temp' | 'medicine' | 'growth' | 'other'

export type MilkMode = 'formula' | 'bottle_breast' | 'breast'
export type BreastSide = 'left' | 'right' | 'both'
export type Accept = 'like' | 'normal' | 'refuse'
export type DiaperKind = 'pee' | 'poop' | 'both'
export type StoolVolume = 'small' | 'medium' | 'large'
export type SleepQuality = 'good' | 'restless' | 'cry'
export type TempMethod = 'ear' | 'forehead' | 'armpit' | 'rectal'

export interface MilkData {
  mode: MilkMode
  amount: number | null      // ml（瓶喂）
  duration: number | null    // 分钟（亲喂）
  side: BreastSide | null
}

export interface SolidData {
  foods: string[]
  amount: string             // 少量 / 半碗 / 一碗 …
  accept: Accept
  reaction: string           // '' 表示无异常
}

export interface DiaperData {
  kind: DiaperKind
  color: string | null       // 见 STOOL_COLORS
  texture: string | null     // 见 STOOL_TEXTURES
  volume: StoolVolume | null
}

export interface SleepData {
  quality: SleepQuality | null
}

export interface TempData {
  value: number              // ℃
  method: TempMethod
}

export interface MedicineData {
  name: string
  dose: string
}

export interface GrowthData {
  weight: number | null      // kg
  height: number | null      // cm
  head: number | null        // cm
}

export interface OtherData {
  title: string
}

export interface LogDataMap {
  milk: MilkData
  solid: SolidData
  diaper: DiaperData
  sleep: SleepData
  temp: TempData
  medicine: MedicineData
  growth: GrowthData
  other: OtherData
}

export type LogSource = 'manual' | 'voice' | 'task'

export interface CareLog<T extends LogType = LogType> extends BaseEntity {
  babyId: ID
  type: T
  date: DateKey
  time: number
  /** 仅睡眠使用；null 且 type=sleep 表示"正在睡" */
  endTime: number | null
  data: LogDataMap[T]
  note: string
  source: LogSource
  taskId: ID | null
}

/* ── 备注（家长补充 / 交接留言） ─────────────────────────────────────────── */

export type NoteTarget = 'log' | 'task' | 'report' | 'day'

export interface Note extends BaseEntity {
  babyId: ID
  targetType: NoteTarget
  /** targetType=day 时为 DateKey */
  targetId: ID
  date: DateKey
  content: string
}

/* ── 计划与打卡 ─────────────────────────────────────────────────────────── */

export type EduCategory = 'gross' | 'fine' | 'sensory' | 'language' | 'social'
export type TaskKind = 'feeding' | 'edu' | 'interaction'
/** day = 日间（育儿嫂执行），evening = 晚间（留给爸爸妈妈） */
export type Slot = 'day' | 'evening'
export type Assignee = 'nanny' | 'parent'

export interface Plan extends BaseEntity {
  babyId: ID
  date: DateKey
  stageKey: string
  focus: string
}

export interface PlanTask extends BaseEntity {
  babyId: ID
  date: DateKey
  kind: TaskKind
  /** feeding → FeedKind；edu / interaction → EduCategory */
  category: FeedKind | EduCategory | null
  slot: Slot
  assignee: Assignee
  time: string | null
  title: string
  desc: string
  steps: string[]
  sourceId: string | null
  amount: number | null
  order: number
}

/** 周模板中的一条安排；weekday 采用 0=周日至6=周六。 */
export interface TemplateTask {
  weekday: number
  kind: TaskKind
  category: FeedKind | EduCategory | null
  slot: Slot
  time: string | null
  title: string
  desc: string
  steps: string[]
  sourceId: string | null
  amount: number | null
  order: number
}

export interface PlanTemplate extends BaseEntity {
  babyId: ID
  name: string
  tasks: TemplateTask[]
}

/** 4 很棒 · 3 不错 · 2 一般 · 1 不配合 */
export type Rating = 1 | 2 | 3 | 4

export interface Checkin extends BaseEntity {
  babyId: ID
  date: DateKey
  taskId: ID
  kind: TaskKind
  category: FeedKind | EduCategory | null
  slot: Slot
  rating: Rating
  tags: string[]
  note: string
  duration: number | null
}

/* ── 每日汇报 ───────────────────────────────────────────────────────────── */

export interface ReportBlock {
  key: string
  title: string
  icon: string
  text: string
  /** 育儿嫂手动改过的块，在"刷新数据"时保留 */
  edited: boolean
}

export interface Report extends BaseEntity {
  babyId: ID
  date: DateKey
  blocks: ReportBlock[]
  publishedAt: number | null
  publishedBy: ID | null
}

/* ── 消息 ──────────────────────────────────────────────────────────────── */

export type NoticeLevel = 'normal' | 'important'

export interface Notice extends BaseEntity {
  recipientId: ID
  level: NoticeLevel
  title: string
  body: string
  /** 应用内路由，点击消息后跳转 */
  link: string
  readAt: number | null
}

/* ── 实体注册表 ─────────────────────────────────────────────────────────── */

export interface EntityMap {
  members: Member
  invites: Invite
  babies: Baby
  logs: CareLog
  notes: Note
  plans: Plan
  tasks: PlanTask
  checkins: Checkin
  reports: Report
  notices: Notice
  templates: PlanTemplate
}

export type EntityName = keyof EntityMap
export type AnyEntity = EntityMap[EntityName]

export const ENTITY_NAMES: readonly EntityName[] = [
  'members', 'invites', 'babies', 'logs', 'notes', 'plans', 'tasks', 'checkins', 'reports', 'notices', 'templates',
] as const

/* ── 同步协议 ───────────────────────────────────────────────────────────── */

export type MutationOp = 'put' | 'del'

export interface Mutation {
  /** 幂等键：同一 mid 重复提交，云端返回首次结果 */
  mid: ID
  entity: EntityName
  op: MutationOp
  id: ID
  data: AnyEntity | null
  at: number
}

export type RejectCode = 'FORBIDDEN' | 'NOT_FOUND' | 'INVALID'

export interface MutationResult {
  mid: ID
  ok: boolean
  code?: RejectCode
  message?: string
  /** 被拒绝时回传云端当前版本，客户端据此回滚；null 表示云端不存在该记录 */
  record?: AnyEntity | null
}

export interface PushResponse {
  results: MutationResult[]
  seq: number
}

export interface Change {
  entity: EntityName
  record: AnyEntity
}

export interface PullResponse {
  changes: Change[]
  cursor: number
  hasMore: boolean
}

export interface SessionInfo {
  token: string
  user: UserProfile
  family: Family | null
  member: Member | null
}

export interface InvitePreview {
  familyName: string
  babyName: string
  relation: Invite['relation']
  inviter: string
  expiresAt: number
}

export interface BabyInput {
  name: string
  gender: Gender
  birthday: DateKey
  feedingMode: FeedingMode
  birthWeight: number | null
  birthHeight: number | null
  allergies: string
}

/** 权限判定所需的最小身份 */
export interface Actor {
  userId: ID
  familyId: ID
  role: Role
  relation: Relation
}
