import type { ActivityStep, Schedule } from './types'

export const activitySteps: ActivityStep[] = [
  {
    title: '准备安全空间',
    text: '选择平整、结实的垫面，移开周围松软物品，让宝宝保持清醒。',
    tip: '活动期间必须有成人全程看护，不要在床、沙发等柔软表面练习。'
  },
  {
    title: '俯卧并稳定身体',
    text: '轻柔地让宝宝俯卧，双臂自然放在胸前两侧，帮助肩部保持稳定。',
    tip: '喂奶后至少等待 30 分钟；如果宝宝明显不适，请立即停止。'
  },
  {
    title: '用声音引导抬头',
    text: '在宝宝前方约 30 厘米处轻声呼唤，也可以缓慢移动高对比玩具。',
    tip: '今天从 2 分钟开始即可，不追求时长，关注宝宝是否舒服。'
  },
  {
    title: '结束并记录表现',
    text: '宝宝疲劳或哭闹时结束练习，抱起安抚，并记录抬头与转头表现。',
    tip: '每个宝宝发展节奏不同，活动不是测试，不与其他宝宝比较。'
  }
]

export const initialSchedules: Schedule[] = [
  { id: 'outdoor14', day: 14, time: '10:00', title: '户外散步', detail: '妈妈 · 30 分钟', color: 'blue', status: 'pending', createdAt: '2026-09-14T10:00:00+08:00' },
  { id: 'bath15', day: 15, time: '19:00', title: '洗澡与抚触', detail: '爸爸负责', color: 'orange', status: 'pending', createdAt: '2026-09-15T19:00:00+08:00' },
  { id: 'read16', day: 16, time: '19:30', title: '亲子阅读', detail: '语言启蒙 · 10 分钟', color: '', status: 'pending', createdAt: '2026-09-16T19:30:00+08:00' },
  { id: 'feed', day: 17, time: '09:30', title: '辅食：南瓜泥', detail: '观察过敏反应', color: 'orange', status: 'completed', createdAt: '2026-09-17T09:30:00+08:00' },
  { id: 'tummy', day: 17, time: '11:00', title: '趴卧适应练习', detail: '第 3 天 · 约 3 分钟', color: '', status: 'pending', createdAt: '2026-09-17T11:00:00+08:00' },
  { id: 'vaccine', day: 17, time: '14:00', title: '社区体检预约', detail: '妈妈 · 社区卫生中心', color: 'blue', status: 'pending', createdAt: '2026-09-17T14:00:00+08:00' },
  { id: 'read', day: 17, time: '19:30', title: '睡前亲子阅读', detail: '爸爸 · 10 分钟', color: '', status: 'pending', createdAt: '2026-09-17T19:30:00+08:00' },
  { id: 'food18', day: 18, time: '09:30', title: '辅食：南瓜泥', detail: '第 2 次尝试', color: 'orange', status: 'pending', createdAt: '2026-09-18T09:30:00+08:00' },
  { id: 'tummy18', day: 18, time: '11:00', title: '趴卧适应练习', detail: '第 4 天', color: '', status: 'pending', createdAt: '2026-09-18T11:00:00+08:00' },
  { id: 'measure20', day: 20, time: '10:00', title: '成长测量', detail: '记录身高与体重', color: 'blue', status: 'pending', createdAt: '2026-09-20T10:00:00+08:00' }
]
