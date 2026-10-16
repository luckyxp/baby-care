<!-- ==========================================================================
  填写人标签：保留称呼与时间，弱化重复头像与角色装饰。
=========================================================================== -->
<script setup lang="ts">
import { computed } from 'vue'
import { memberLabel } from '@/shared/constants'
import { useSession } from '@/stores/session'

const props = defineProps<{ userId: string; suffix?: string }>()
const session = useSession()

const view = computed(() => {
  const m = session.memberOf(props.userId)
  if (!m) {
    return '家人'
  }
  const label = memberLabel(m) + (m.userId === session.user?.id ? '(我)' : '') + (m.deleted ? '(已移出)' : '')
  return label
})
</script>

<template>
  <span class="author">
    {{ view }}<span v-if="suffix" class="muted">{{ suffix }}</span>
  </span>
</template>

<style scoped>
.author {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 12px;
  color: var(--bc-text-3);
  white-space: nowrap;
}

.muted {
  margin-left: 4px;
}
</style>
