/* ============================================================================
 *  日志与备注的业务操作（均经 repo 写入：权限预检 + 乐观落库 + 离线队列）
 * ========================================================================== */

import type { CareLog, LogDataMap, LogSource, LogType, Note, NoteTarget } from '@/shared/types'
import { create, remove, update } from '@/db/repo'
import { dateKey } from '@/utils/time'

export interface LogInput<T extends LogType = LogType> {
  type: T
  time: number
  endTime: number | null
  data: LogDataMap[T]
  note: string
  source?: LogSource
  taskId?: string | null
}

export function addLog(babyId: string, input: LogInput): Promise<CareLog> {
  return create('logs', {
    babyId,
    type: input.type,
    date: dateKey(input.time),
    time: input.time,
    endTime: input.endTime,
    data: input.data,
    note: input.note.trim(),
    source: input.source ?? 'manual',
    taskId: input.taskId ?? null,
  })
}

export function editLog(log: CareLog, input: LogInput): Promise<CareLog> {
  return update('logs', {
    id: log.id,
    type: input.type,
    date: dateKey(input.time),
    time: input.time,
    endTime: input.endTime,
    data: input.data,
    note: input.note.trim(),
  })
}

export function removeLog(log: CareLog): Promise<void> {
  return remove('logs', log.id)
}

/** 结束进行中的睡眠 */
export function wakeUp(log: CareLog, at: number = Date.now()): Promise<CareLog> {
  return update('logs', { id: log.id, endTime: Math.max(at, log.time + 60_000) })
}

export function addNote(babyId: string, targetType: NoteTarget, targetId: string, date: string, content: string): Promise<Note> {
  return create('notes', { babyId, targetType, targetId, date, content: content.trim() })
}

export function removeNote(note: Note): Promise<void> {
  return remove('notes', note.id)
}
