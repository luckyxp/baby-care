<!-- ==========================================================================
  填写人标签：头像 + 称呼（育儿嫂显示昵称，家长显示"爸爸/妈妈"），颜色区分角色
=========================================================================== -->
<script setup lang="ts">
import { computed } from 'vue'
import { RELATION_AVATAR, RELATION_COLOR, memberLabel } from '@/shared/constants'
import { useSession } from '@/stores/session'

const props = defineProps<{ userId: string; suffix?: string }>()
const session = useSession()

const view = computed(() => {
  const m = session.memberOf(props.userId)
  if (!m) {
    return { avatar: '👤', label: '家人', color: 'var(--bc-text-3)' }
  }
  const label = memberLabel(m) + (m.userId === session.user?.id ? '(我)' : '') + (m.deleted ? '(已移出)' : '')
  return { avatar: m.avatar || RELATION_AVATAR[m.relation], label, color: RELATION_COLOR[m.relation] }
})
</script>

<template>
  <span class="author" :style="{ color: view.color }">
    <span class="author-avatar">{{ view.avatar }}</span>{{ view.label }}<span v-if="suffix" class="muted">{{ suffix }}</span>
  </span>
</template>

<style scoped>
.author {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 12px;
  white-space: nowrap;
}

.author-avatar {
  font-size: 13px;
}

.muted {
  margin-left: 4px;
}
</style>
