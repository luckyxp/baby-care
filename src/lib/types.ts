export type TabId = 'today' | 'calendar' | 'knowledge' | 'records' | 'profile'
export type CalendarMode = '日' | '周' | '月'
export type ScheduleStatus = 'pending' | 'completed' | 'skipped'
export type RecordType = '喂养' | '睡眠' | '尿布' | '活动'
export type ModalType = 'emergency' | 'activity' | 'record' | 'schedule' | 'article' | null

export interface Schedule {
  id: string
  day: number
  time: string
  title: string
  detail: string
  color: '' | 'orange' | 'blue'
  status: ScheduleStatus
  createdAt: string
}

export interface CareRecord {
  id: string
  type: RecordType
  icon: string
  title: string
  detail: string
  date: string
  time: string
  createdAt: string
}

export interface ActivityProgress {
  activityId: string
  step: number
  completed: boolean
  updatedAt: string
}

export interface ActivityStep {
  title: string
  text: string
  tip: string
}
