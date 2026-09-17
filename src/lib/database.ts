import Dexie, { type EntityTable } from 'dexie'
import { initialSchedules } from './data'
import type { ActivityProgress, CareRecord, Schedule } from './types'

// ----------------------------------------------------------------------
// 本地数据库：所有业务数据以 IndexedDB 为唯一可信来源
// ----------------------------------------------------------------------

class SproutDatabase extends Dexie {
  schedules!: EntityTable<Schedule, 'id'>
  careRecords!: EntityTable<CareRecord, 'id'>
  activityProgress!: EntityTable<ActivityProgress, 'activityId'>

  constructor() {
    super('sprout-parenting')

    this.version(1).stores({
      schedules: 'id, day, time, status, createdAt',
      careRecords: 'id, type, date, time, createdAt',
      activityProgress: 'activityId, completed, updatedAt'
    })
  }
}

export const db = new SproutDatabase()

db.on('populate', async () => {
  await db.schedules.bulkAdd(initialSchedules)
  await db.careRecords.bulkAdd([
    { id: 'record-feed-1', type: '喂养', icon: 'milk', title: '母乳喂养', detail: '左侧 · 18 分钟', date: '2026-09-17', time: '08:12', createdAt: '2026-09-17T08:12:00+08:00' },
    { id: 'record-sleep-1', type: '睡眠', icon: 'moon', title: '上午睡眠', detail: '1 小时 20 分钟', date: '2026-09-17', time: '10:35', createdAt: '2026-09-17T10:35:00+08:00' },
    { id: 'record-diaper-1', type: '尿布', icon: 'drop', title: '更换尿布', detail: '正常 · 黄色', date: '2026-09-17', time: '11:04', createdAt: '2026-09-17T11:04:00+08:00' }
  ])
  await db.activityProgress.add({
    activityId: 'tummy-14-days',
    step: 2,
    completed: false,
    updatedAt: new Date().toISOString()
  })
})

export async function initializeDatabase(): Promise<void> {
  if (!db.isOpen()) {
    await db.open()
  }
}

export async function loadSchedules(): Promise<Schedule[]> {
  return db.schedules.orderBy('time').toArray()
}

export async function loadCareRecords(): Promise<CareRecord[]> {
  return db.careRecords.orderBy('createdAt').reverse().toArray()
}

export async function loadActivityProgress(): Promise<ActivityProgress> {
  return (await db.activityProgress.get('tummy-14-days')) ?? {
    activityId: 'tummy-14-days',
    step: 0,
    completed: false,
    updatedAt: new Date().toISOString()
  }
}
