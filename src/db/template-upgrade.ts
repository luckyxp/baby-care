/* ============================================================================
 * 日模板结构升级：一次性拆分混合模板，运行时只使用带分类的新结构。
 * ----------------------------------------------------------------------------
 * 同步改写离线队列与删除记录；保留模板内容、护理记录和日期计划。
 * ========================================================================== */

import type { Transaction } from 'dexie'
import type { Family, Mutation, PlanTemplate, TemplateKind } from '@/shared/types'

type PreviousTemplate = Omit<PlanTemplate, 'kind'>
const kinds: TemplateKind[] = ['feeding', 'edu']

function split(record: PreviousTemplate): PlanTemplate[] {
  return kinds.flatMap((kind) => {
    const tasks = record.tasks.filter((task) => (task.kind === 'feeding') === (kind === 'feeding'))
      .map((task, index) => ({ ...task, order: index + 1 }))
    return tasks.length || record.deleted ? [{ ...record, id: `${record.id}:${kind}`, kind, tasks }] : []
  })
}

export async function splitDailyTemplates(transaction: Transaction, mode: 'client' | 'cloud'): Promise<void> {
  const table = transaction.table<PlanTemplate, string>('dailyTemplates')
  const records = (await table.toArray()).flatMap(split)
  if (mode === 'cloud') {
    const families = transaction.table<Family, string>('families')
    const updated = new Map((await families.toArray()).map((family) => [family.id, family]))
    for (const record of records) record.seq = ++updated.get(record.familyId)!.seq
    await families.bulkPut([...updated.values()])
  } else {
    const outbox = transaction.table<Mutation & { seqNo?: number }, number>('outbox')
    const pending = await outbox.orderBy('seqNo').toArray()
    const rewritten = pending.flatMap(({ seqNo: _seqNo, ...mutation }) => {
      if (mutation.entity !== 'dailyTemplates') return [mutation]
      if (mutation.op === 'del') {
        return kinds.map((kind) => ({ ...mutation, mid: `${mutation.mid}:${kind}`, id: `${mutation.id}:${kind}` }))
      }
      return split(mutation.data as PreviousTemplate).map((record) => ({
        ...mutation, mid: `${mutation.mid}:${record.kind}`, id: record.id, data: record,
      }))
    })
    await outbox.clear()
    await outbox.bulkAdd(rewritten)
  }
  await table.clear()
  await table.bulkPut(records)
}
