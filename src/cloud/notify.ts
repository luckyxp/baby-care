/* ============================================================================
 *  模拟云端 · 消息分发规则
 * ----------------------------------------------------------------------------
 *  "谁做了什么 → 通知谁"在云端统一推导，客户端只负责展示与提醒。
 *
 *    日志新增   → 其他成员（异常体温/大便/过敏标记为重要）
 *    宝宝醒了   → 其他成员（睡眠记录从"进行中"变为结束）
 *    备注新增   → 其他成员（重要）
 *    任务打卡   → 其他成员
 *    汇报发布   → 家长（重要）
 * ========================================================================== */

import { LOG_KINDS, RATING_LABEL, memberLabel } from '@/shared/constants'
import type {
  Actor, AnyEntity, CareLog, Checkin, EntityName, Member, Note, NoticeLevel, Report,
} from '@/shared/types'
import { abnormalReason, sleepMinutes, summarizeLog } from '@/domain/log-kinds'
import { dateLabel, fmtDuration, hm } from '@/utils/time'
import type { CloudDB } from './db'

export interface NoticeDraft {
  title: string
  body: string
  level: NoticeLevel
  link: string
  to: Member[]
}

const clip = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n)}…` : s)

export async function deriveNotice(
  db: CloudDB,
  actor: Actor,
  entity: EntityName,
  rec: AnyEntity,
  prev: AnyEntity | undefined,
): Promise<NoticeDraft | null> {
  const members = (await db.members.where('familyId').equals(actor.familyId).toArray()).filter((m) => !m.deleted)
  const me = members.find((m) => m.userId === actor.userId)
  const who = me ? memberLabel(me) : '家人'
  const others = members.filter((m) => m.userId !== actor.userId)

  switch (entity) {
    case 'logs': {
      const log = rec as CareLog
      const before = prev as CareLog | undefined
      if (!before) {
        const abnormal = abnormalReason(log)
        return {
          title: `${who}记录了${LOG_KINDS[log.type].label}`,
          body: `${hm(log.time)} ${summarizeLog(log, log.updatedAt)}${abnormal ? `（${abnormal}）` : ''}`,
          level: abnormal ? 'important' : 'normal',
          link: `/logs?date=${log.date}&focus=${log.id}`,
          to: others,
        }
      }
      if (log.type === 'sleep' && before.endTime === null && log.endTime !== null) {
        return {
          title: '宝宝睡醒啦',
          body: `${hm(log.time)}-${hm(log.endTime)}，共睡了${fmtDuration(sleepMinutes(log))}`,
          level: 'normal',
          link: `/logs?date=${log.date}&focus=${log.id}`,
          to: others,
        }
      }
      return null
    }
    case 'notes': {
      if (prev) {
        return null
      }
      const note = rec as Note
      const link = {
        log: `/logs?date=${note.date}&focus=${note.targetId}`,
        task: `/plan?date=${note.date}&task=${note.targetId}`,
        report: `/report?date=${note.date}`,
        day: '/home',
      }[note.targetType]
      return { title: `${who}补充了备注`, body: clip(note.content), level: 'important', link, to: others }
    }
    case 'checkins': {
      if (prev) {
        return null
      }
      const ck = rec as Checkin
      const task = await db.entity('tasks').get(ck.taskId)
      return {
        title: `${who}完成了「${task?.title ?? '计划任务'}」`,
        body: `宝宝表现：${RATING_LABEL[ck.rating]}${ck.note ? `，${clip(ck.note, 40)}` : ''}`,
        level: 'normal',
        link: `/plan?date=${ck.date}&task=${ck.taskId}`,
        to: others,
      }
    }
    case 'reports': {
      const report = rec as Report
      const before = prev as Report | undefined
      if (!report.publishedAt || before?.publishedAt === report.publishedAt) {
        return null
      }
      const first = report.blocks.find((b) => b.text.trim())
      return {
        title: `${dateLabel(report.date)}的护理汇报已发布`,
        body: first ? clip(`${first.title}：${first.text.replace(/\s+/g, ' ')}`) : '点击查看完整汇报',
        level: 'important',
        link: `/report?date=${report.date}`,
        to: others.filter((m) => m.role === 'parent'),
      }
    }
    default:
      return null
  }
}
