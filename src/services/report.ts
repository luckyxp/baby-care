/* ============================================================================
 *  每日汇报的业务操作
 * ----------------------------------------------------------------------------
 *  每个宝宝每天至多一份汇报，使用确定性 ID —— 多台设备各自保存也只会得到同一份。
 *  发布 = 保存 + 写入 publishedAt / publishedBy，云端据此向家长推送重要消息；
 *  已发布后再次发布会刷新 publishedAt，家长会再次收到"已发布"提醒。
 * ========================================================================== */

import type { Baby, DateKey, Report, ReportBlock } from '@/shared/types'
import { db } from '@/db/client'
import { create, update } from '@/db/repo'
import { useSession } from '@/stores/session'

export const reportIdOf = (babyId: string, date: DateKey) => `report:${babyId}:${date}`

const plainBlocks = (blocks: ReportBlock[]): ReportBlock[] =>
  blocks.map(({ key, title, icon, text, edited }) => ({ key, title, icon, text, edited }))

export async function saveReport(baby: Baby, date: DateKey, blocks: ReportBlock[]): Promise<Report> {
  const id = reportIdOf(baby.id, date)
  const prev = await db().reports.get(id)
  if (prev) {
    return update('reports', { id, blocks: plainBlocks(blocks) })
  }
  return create('reports', { id, babyId: baby.id, date, blocks: plainBlocks(blocks), publishedAt: null, publishedBy: null })
}

export async function publishReport(baby: Baby, date: DateKey, blocks: ReportBlock[]): Promise<Report> {
  const saved = await saveReport(baby, date, blocks)
  return update('reports', { id: saved.id, publishedAt: Date.now(), publishedBy: useSession().user?.id ?? null })
}
