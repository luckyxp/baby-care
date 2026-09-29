/* ============================================================================
 *  模拟云端 · 存储层
 * ----------------------------------------------------------------------------
 *  静态托管阶段没有服务器，这里用一个同源共享的 IndexedDB 扮演"云数据库"。
 *  同一浏览器的多个标签页 = 多台设备，各自登录不同账号即可演示三方实时同步。
 *
 *  索引说明：
 *    [familyId+seq]  增量拉取的唯一入口（按家庭 + 变更序号范围扫描）
 * ========================================================================== */

import Dexie, { type Table } from 'dexie'
import type { EntityMap, EntityName, Family, Member, MutationResult, UserProfile } from '@/shared/types'

export interface UserRow extends UserProfile {
  passwordHash: string
  salt: string
  createdAt: number
}

export interface SessionRow {
  token: string
  userId: string
  createdAt: number
}

/** 已处理的变更（幂等表） */
export interface MutationRow {
  mid: string
  userId: string
  result: MutationResult
  at: number
}

const ENTITY_INDEX = 'id, [familyId+seq], familyId'

export class CloudDB extends Dexie {
  users!: Table<UserRow, string>
  sessions!: Table<SessionRow, string>
  families!: Table<Family, string>
  mutations!: Table<MutationRow, string>
  members!: Table<Member, string>

  constructor(name = 'bc_cloud') {
    super(name)
    this.version(1).stores({
      users: 'id, &phone',
      sessions: 'token, userId',
      families: 'id',
      mutations: 'mid, at',
      members: `${ENTITY_INDEX}, userId`,
      invites: `${ENTITY_INDEX}, &code`,
      babies: ENTITY_INDEX,
      logs: ENTITY_INDEX,
      notes: ENTITY_INDEX,
      plans: ENTITY_INDEX,
      tasks: ENTITY_INDEX,
      checkins: ENTITY_INDEX,
      reports: ENTITY_INDEX,
      notices: ENTITY_INDEX,
    })
  }

  entity<K extends EntityName>(name: K): Table<EntityMap[K], string> {
    return this.table(name)
  }
}
