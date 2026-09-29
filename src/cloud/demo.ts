/* ============================================================================
 *  演示数据 · Demo Seed
 * ----------------------------------------------------------------------------
 *  一键生成"育儿嫂 + 妈妈 + 爸爸"三方家庭，并回填过去 6 天 + 今天的真实感数据，
 *  让静态托管的演示站点打开即可体验完整流程。
 *
 *    注册三个账号 ─▶ 育儿嫂建家庭 ─▶ 邀请码加入 ─▶ 静默批量回填 ─▶ 少量实时动作
 *                                                   (silent，不产生消息)   (生成未读消息)
 *
 *  约定：
 *    · 直接调用 CloudServer，不经 transport —— 离线也能初始化；
 *    · 云端以推送者为填写人，所以不同作者的记录用各自的 token 分别推送；
 *    · 数值由固定种子的 PRNG 生成，同一天多次初始化得到的数据形态一致。
 * ========================================================================== */

import Dexie from 'dexie'
import { SOLID_AMOUNTS } from '@/shared/constants'
import type {
  Accept, Baby, CareLog, Checkin, DateKey, EduCategory, EntityName, LogDataMap, LogType, Member, Mutation,
  Note, Plan, PlanTask, Rating, Relation, Report, SessionInfo,
} from '@/shared/types'
import { buildReport } from '@/domain/report'
import { recommendPlan } from '@/domain/planner'
import { foodsFor, stageOf, findLibraryItem } from '@/library'
import { uid } from '@/utils/id'
import { ageOf, atTime, dateKey, dayjs, shiftDate } from '@/utils/time'
import { cloud, type CloudServer } from './server'

export interface DemoAccount {
  relation: Relation
  phone: string
  password: string
  nickname: string
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  { relation: 'nanny', phone: '13800000001', password: '123456', nickname: '王阿姨' },
  { relation: 'mother', phone: '13800000002', password: '123456', nickname: '小美' },
  { relation: 'father', phone: '13800000003', password: '123456', nickname: '大伟' },
]

export const isDemoPhone = (phone: string | undefined) => DEMO_ACCOUNTS.some((a) => a.phone === phone)

const PAST_DAYS = 6
const MINUTE = 60_000

/* ── 可复现随机数（mulberry32） ─────────────────────────────────────────── */

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/* ── 文案素材 ───────────────────────────────────────────────────────────── */

const CHECKIN_NOTES: Record<EduCategory, string[]> = {
  gross: ['趴着能抬头挺胸坚持半分钟', '会用手臂撑起来向前够玩具', '独坐比昨天稳多了', '腹爬前进了一小段'],
  fine: ['会用拇指和食指捏小积木了', '能把摇铃从左手换到右手', '抓握很有力，拍打玩具很起劲', '撕纸玩得很专注'],
  sensory: ['对镜子里的自己笑了好几次', '会转头寻找声音的来源', '盯着黑白卡看了很久', '摸到软毛巾时很开心'],
  language: ['跟着发出 ba-ba 的音', '听到自己名字会回头', '看绘本时一直咿咿呀呀回应', '模仿了"啊"的口型'],
  social: ['玩躲猫猫笑得咯咯响', '看到妈妈视频很兴奋，一直伸手', '会主动伸手要抱', '对陌生人有点认生，抱一会儿就好了'],
}
const GOOD_TAGS = ['专注', '开心', '主动尝试', '有进步', '坚持完成']
const MEH_TAGS = ['容易分心', '犯困', '兴趣不大']

/* ── 构造工具 ───────────────────────────────────────────────────────────── */

interface Actor {
  info: SessionInfo
  relation: Relation
}

type Queue = Map<string, Mutation[]>

function envelope(a: Actor, at: number) {
  const uidOf = a.info.user.id
  return { familyId: a.info.family!.id, createdBy: uidOf, createdAt: at, updatedBy: uidOf, updatedAt: at, deleted: 0 as const, seq: 0 }
}

function enqueue(q: Queue, a: Actor, entity: EntityName, rec: { id: string; createdAt: number }): void {
  const list = q.get(a.info.token) ?? []
  list.push({ mid: uid(), entity, op: 'put', id: rec.id, data: rec as unknown as Mutation['data'], at: rec.createdAt })
  q.set(a.info.token, list)
}

async function flush(server: CloudServer, q: Queue, silent: boolean): Promise<void> {
  for (const [token, list] of q) {
    if (list.length) {
      await server.push(token, list, { silent })
    }
  }
  q.clear()
}

/* ── 主流程 ─────────────────────────────────────────────────────────────── */

let pending: Promise<void> | null = null

export function ensureDemo(server: CloudServer = cloud()): Promise<void> {
  pending ??= seed(server).finally(() => {
    pending = null
  })
  return pending
}

async function seed(server: CloudServer): Promise<void> {
  if (await server.db.users.where('phone').equals(DEMO_ACCOUNTS[0].phone).count()) {
    return
  }
  const rand = mulberry32(20260928)
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]
  const between = (lo: number, hi: number) => lo + rand() * (hi - lo)
  const now = Date.now()
  const today = dateKey(now)

  /* ── 账号与家庭 ── */

  const [nannyAcc, momAcc, dadAcc] = DEMO_ACCOUNTS
  let nannyInfo = await server.register(nannyAcc)
  nannyInfo = await server.createFamily(nannyInfo.token, {
    name: '小米粒', gender: 'girl',
    birthday: dayjs().subtract(7, 'month').subtract(12, 'day').format('YYYY-MM-DD'),
    feedingMode: 'mixed', birthWeight: 3.3, birthHeight: 50, allergies: '',
  })
  const join = async (acc: DemoAccount) => {
    const invite = await server.createInvite(nannyInfo.token, acc.relation as 'mother' | 'father')
    const info = await server.register(acc)
    return server.joinFamily(info.token, invite.code)
  }
  const nanny: Actor = { info: nannyInfo, relation: 'nanny' }
  const mom: Actor = { info: await join(momAcc), relation: 'mother' }
  const dad: Actor = { info: await join(dadAcc), relation: 'father' }
  const familyId = nannyInfo.family!.id

  const baby = (await server.db.entity('babies').where('familyId').equals(familyId).first()) as Baby
  const members = (await server.db.members.where('familyId').equals(familyId).toArray()) as Member[]

  /* ── 本地构造全部记录 ── */

  const q: Queue = new Map()
  const logs: CareLog[] = []
  const tasks: PlanTask[] = []
  const checkins: Checkin[] = []
  const notes: Note[] = []

  const log = <T extends LogType>(a: Actor, type: T, time: number, data: LogDataMap[T], extra: Partial<CareLog> = {}): CareLog | null => {
    if (time > now) {
      return null
    }
    const rec: CareLog = {
      ...envelope(a, time), id: uid(), babyId: baby.id, type, date: dateKey(time), time, endTime: null,
      data, note: '', source: 'manual', taskId: null, ...extra,
    }
    logs.push(rec)
    return rec
  }

  const sleep = (a: Actor, start: number, minutes: number) => {
    if (start > now) {
      return null
    }
    const end = start + minutes * MINUTE
    const quality = pick(['good', 'good', 'good', 'restless'] as const)
    return log(a, 'sleep', start, { quality: end > now ? null : quality }, { endTime: end > now ? null : end })
  }

  const note = (a: Actor, targetType: Note['targetType'], targetId: string, date: DateKey, content: string, at: number) => {
    const rec: Note = { ...envelope(a, at), id: uid(), babyId: baby.id, targetType, targetId, date, content }
    notes.push(rec)
    return rec
  }

  const days = Array.from({ length: PAST_DAYS + 1 }, (_, i) => shiftDate(today, i - PAST_DAYS))
  let looseStool: CareLog | null = null

  // 第一天之前那一晚的整觉，让首日凌晨也有睡眠数据
  sleep(dad, atTime(shiftDate(days[0], -1), '20:45') + between(-15, 15) * MINUTE, between(580, 620))

  days.forEach((d, di) => {
    const isToday = d === today
    const months = ageOf(baby.birthday, d).monthsFloat
    const stage = stageOf(months)
    const t = (hhmm: string, jitter = 0) => atTime(d, hhmm) + Math.round(between(-jitter, jitter)) * MINUTE
    const parent = di % 2 ? mom : dad

    /* 喂养：按阶段作息，量在计划 ±20ml 波动 */
    for (const slot of stage.schedule) {
      if (slot.kind === 'milk') {
        const evening = slot.time >= '20:00'
        if (evening && rand() < 0.5) {
          log(mom, 'milk', t(slot.time, 15), { mode: 'breast', amount: null, duration: Math.round(between(12, 22)), side: pick(['left', 'right', 'both'] as const) })
        } else {
          const amount = Math.round(((slot.amount ?? 180) + between(-20, 20)) / 10) * 10
          log(evening ? parent : nanny, 'milk', t(slot.time, 20), { mode: 'formula', amount, duration: null, side: null })
        }
      } else if (slot.kind === 'solid') {
        const pool = foodsFor(months).filter((f) => !f.allergen && ['grain', 'veg', 'fruit', 'meat'].includes(f.group))
        const foods = [...new Set([pick(pool).name, pick(pool).name])].slice(0, rand() < 0.5 ? 1 : 2)
        const accept = pick<Accept>(['like', 'like', 'normal', 'normal', 'refuse'])
        log(nanny, 'solid', t(slot.time, 15), { foods, amount: pick(SOLID_AMOUNTS.slice(1, 5)), accept, reaction: '' })
      } else if (slot.kind === 'supplement') {
        log(nanny, 'medicine', t(slot.time, 20), { name: '维生素D', dose: '1粒' })
      }
    }
    if (rand() < 0.6) {
      log(dad, 'milk', t('02:30', 30), { mode: 'formula', amount: Math.round(between(12, 16)) * 10, duration: null, side: null })
    }

    /* 排便：小便 5-7 次，大便 1 次 */
    const pees = 5 + Math.floor(rand() * 3)
    for (let i = 0; i < pees; i++) {
      const at = atTime(d, '07:30') + ((i + rand() * 0.6) * 13 * 60 * MINUTE) / pees
      log(at > atTime(d, '19:30') ? parent : nanny, 'diaper', at, { kind: 'pee', color: null, texture: null, volume: null })
    }
    const loose = di === 3
    const poop = log(nanny, 'diaper', t('11:20', 60), {
      kind: rand() < 0.5 ? 'both' : 'poop',
      color: pick(['yellow', 'golden', 'yellow', 'brown']),
      texture: loose ? 'loose' : pick(['paste', 'soft', 'soft']),
      volume: pick(['small', 'medium', 'medium', 'large'] as const),
    })
    if (loose) {
      looseStool = poop
    }

    /* 睡眠：白天 2-3 次小睡 + 夜间整觉（跨夜） */
    sleep(nanny, t('09:20', 15), between(45, 70))
    sleep(nanny, t('13:30', 15), between(80, 110))
    if (rand() < 0.5) {
      sleep(nanny, t('16:50', 10), between(30, 45))
    }
    sleep(parent, t('20:45', 15), between(560, 620))

    /* 体温与成长 */
    if (di % 3 === 0) {
      log(nanny, 'temp', t('08:10', 20), { value: Math.round(between(36.5, 37.1) * 10) / 10, method: 'ear' })
    }
    if (di === 1) {
      log(nanny, 'growth', t('10:00', 10), { weight: 8.3, height: 68.5, head: 43.2 }, { note: '社区儿保体检' })
    }

    /* 计划与打卡 */
    const bundle = recommendPlan(baby, d)
    const planAt = atTime(d, '07:20')
    enqueue(q, nanny, 'plans', { ...envelope(nanny, planAt), ...bundle.plan, id: bundle.plan.id! } as Plan)
    const dayTasks = bundle.tasks.map((x) => ({ ...envelope(nanny, planAt), ...x, id: x.id! }) as PlanTask)
    tasks.push(...dayTasks)

    for (const task of dayTasks.filter((x) => x.kind !== 'feeding')) {
      const evening = task.slot === 'evening'
      const doer = evening ? pick([mom, dad]) : nanny
      const at = evening ? t('20:00', 25) : t(pick(['10:00', '11:15', '15:10', '16:30', '17:20']), 20)
      const chance = isToday ? (evening ? 0 : 0.5) : evening ? 0.6 : 0.8
      if (at > now || rand() > chance) {
        continue
      }
      const rating = pick<Rating>([4, 4, 3, 3, 3, 2])
      const cat = task.category as EduCategory
      const item = findLibraryItem(task.sourceId ?? '')
      checkins.push({
        ...envelope(doer, at), id: uid(), babyId: baby.id, date: d, taskId: task.id, kind: task.kind,
        category: task.category, slot: task.slot, rating,
        tags: rating >= 3 ? [pick(GOOD_TAGS)] : [pick(MEH_TAGS)],
        note: CHECKIN_NOTES[cat] ? pick(CHECKIN_NOTES[cat]) : '',
        duration: item && 'duration' in item ? item.duration : null,
      })
    }

    if (di === PAST_DAYS - 4) {
      note(mom, 'day', d, d, '今晚我们带她去外婆家吃饭，可能九点才到家，睡前奶我来喂', t('17:00'))
    }
    const evening = dayTasks.find((x) => x.slot === 'evening' && x.kind === 'interaction')
    if (di === PAST_DAYS - 2 && evening) {
      note(dad, 'task', evening.id, d, '今晚讲了两遍，她一直盯着图看，还伸手去拍书', t('20:40'))
    }
  })

  if (looseStool) {
    const l = looseStool as CareLog
    note(mom, 'log', l.id, l.date, '今天大便有点稀，明天辅食少放点油', l.time + 3 * 60 * MINUTE)
    note(nanny, 'log', l.id, l.date, '好的，明天改成清蒸南瓜泥，不放油，再观察一下', l.time + 3.5 * 60 * MINUTE)
  }

  /* ── 回填：计划 → 日志 → 打卡 → 备注（打卡依赖任务先入库） ── */

  const author = (userId: string) => [nanny, mom, dad].find((a) => a.info.user.id === userId)!
  tasks.forEach((x) => enqueue(q, nanny, 'tasks', x))
  await flush(server, q, true)
  logs.forEach((x) => enqueue(q, author(x.createdBy), 'logs', x))
  await flush(server, q, true)
  checkins.forEach((x) => enqueue(q, author(x.createdBy), 'checkins', x))
  notes.forEach((x) => enqueue(q, author(x.createdBy), 'notes', x))
  await flush(server, q, true)

  /* ── 历史汇报：以 19:30 为截止生成并发布；昨天的先存草稿，稍后"刚刚发布" ── */

  const yesterday = shiftDate(today, -1)
  let yesterdayReport: Report | null = null
  for (const d of days.slice(0, -1)) {
    const cut = atTime(d, '19:30')
    const blocks = buildReport({
      baby, date: d, members, now: cut,
      logs: logs.filter((l) => l.time <= cut && l.date >= shiftDate(d, -1)),
      tasks: tasks.filter((x) => x.date === d),
      checkins: checkins.filter((c) => c.date === d && c.createdAt <= cut),
      dayNotes: notes.filter((n) => n.targetType === 'day' && n.targetId === d),
    })
    if (d === shiftDate(today, -2) || d === shiftDate(today, -5)) {
      const summary = blocks.find((b) => b.key === 'summary')
      if (summary) {
        summary.text = '今天整体状态很好：午睡睡得很香，下午在爬行垫上来回爬了好几趟，辅食吃得很干净～\n晚上如果有点闹，可能是在长牙，可以给她咬咬牙胶。'
        summary.edited = true
      }
    }
    const report: Report = {
      ...envelope(nanny, cut), id: `report:${baby.id}:${d}`, babyId: baby.id, date: d, blocks,
      publishedAt: d === yesterday ? null : cut, publishedBy: d === yesterday ? null : nanny.info.user.id,
    }
    enqueue(q, nanny, 'reports', report)
    if (d === yesterday) {
      yesterdayReport = report
    }
  }
  const lastReport = days.slice(0, -1).at(-2)
  if (lastReport) {
    note(mom, 'report', `report:${baby.id}:${lastReport}`, lastReport, '辛苦王阿姨！明天我早点下班回来陪她', atTime(lastReport, '20:10'))
    enqueue(q, mom, 'notes', notes[notes.length - 1])
  }
  await flush(server, q, true)

  /* ── 实时动作：为家人生成几条未读消息 ── */

  if (yesterdayReport) {
    const r = yesterdayReport as Report
    const published: Report = { ...r, publishedAt: atTime(yesterday, '19:30'), publishedBy: nanny.info.user.id, createdAt: now }
    enqueue(q, nanny, 'reports', published)
  }
  const recent = now - 8 * MINUTE
  const milk = log(nanny, 'milk', recent, { mode: 'formula', amount: 180, duration: null, side: null })
  if (milk) {
    enqueue(q, nanny, 'logs', milk)
  }
  await flush(server, q, false)
  enqueue(q, dad, 'notes', note(dad, 'day', today, today, '今天下班会晚一点，晚间的亲子游戏让妈妈来陪她玩', now - 2 * MINUTE))
  await flush(server, q, false)
}

/* ── 重置：仅清理演示家庭，不影响真实用户 ────────────────────────────── */

const ENTITY_TABLES: EntityName[] = ['members', 'invites', 'babies', 'logs', 'notes', 'plans', 'tasks', 'checkins', 'reports', 'notices']

export async function resetDemo(server: CloudServer = cloud()): Promise<void> {
  const db = server.db
  const users = await db.users.where('phone').anyOf(DEMO_ACCOUNTS.map((a) => a.phone)).toArray()
  const userIds = users.map((u) => u.id)
  const families = [...new Set((await db.members.where('userId').anyOf(userIds).toArray()).map((m) => m.familyId))]

  await db.transaction('rw', [db.users, db.sessions, db.families, db.mutations, ...ENTITY_TABLES.map((n) => db.table(n))], async () => {
    for (const name of ENTITY_TABLES) {
      await db.table(name).where('familyId').anyOf(families).delete()
    }
    await db.families.bulkDelete(families)
    await db.sessions.where('userId').anyOf(userIds).delete()
    await db.mutations.filter((m) => userIds.includes(m.userId)).delete()
    await db.users.bulkDelete(userIds)
  })
  // 各演示账号在本机的本地副本一并清除（其他标签页会因会话失效回到登录页）
  userIds.forEach((id) => void Dexie.delete(`bc_client_${id}`))
  await ensureDemo(server)
}
