<!-- ==========================================================================
  消息中心：查看本机模拟消息、标记已读、跳转关联记录
=========================================================================== -->
<script setup lang="ts">
import { useRouter } from 'vue-router'
import PageNav from '@/components/PageNav.vue'
import { useNotices } from '@/composables/useNotices'
import { useAction } from '@/composables/useAction'
import { useClock } from '@/composables/useClock'
import type { Notice } from '@/shared/types'
import { ago } from '@/utils/time'

const router = useRouter()
const { now } = useClock()
const { list, unread, markRead, markAll } = useNotices()
const { busy, run } = useAction()

async function open(n: Notice) {
  const success = await run(async () => {
    await markRead(n)
    return true
  })
  if (success) {
    await router.push(n.link.startsWith('/') && !n.link.startsWith('//') ? n.link : '/home')
  }
}
</script>

<template>
  <div class="page notices-page">
    <PageNav>
      <template #right><button type="button" class="link mark-all" :disabled="!unread || busy" @click="run(markAll, '已全部标记为已读')">全部已读</button></template>
    </PageNav>
    <div class="page-body">
      <div class="header-line"><span>{{ unread ? `${unread} 条未读` : '没有未读消息' }}</span><span class="pill">本机消息演示</span></div>
      <p class="limit-note">本版本无远程推送，关闭全部页面后不能接收新提醒。</p>
      <van-empty v-if="!list.length" description="还没有消息，家人的记录和留言会出现在这里" image-size="100" />
      <button v-for="n in list" :key="n.id" type="button" class="card notice" :class="{ unread: !n.readAt }" :disabled="busy" @click="open(n)">
        <div class="notice-icon" :class="{ important: n.level === 'important' }" aria-hidden="true"><van-icon :name="n.level === 'important' ? 'bell' : 'chat-o'" size="22" /></div>
        <div class="grow">
          <div class="notice-title"><strong>{{ n.title }}</strong><span v-if="!n.readAt" class="unread-dot" aria-label="未读" /></div>
          <p class="notice-body">{{ n.body }}</p>
          <div class="row"><time>{{ ago(n.createdAt, now) }}</time><span v-if="n.level === 'important'" class="pill pill--warn">重要</span></div>
        </div>
        <van-icon class="arrow" name="arrow" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.mark-all { min-height: 44px; font-size: 13px; }
.mark-all:disabled { color: var(--bc-text-3); }
.header-line { display: flex; align-items: center; justify-content: space-between; margin: 22px 0 8px; font-weight: 600; }
.limit-note { margin: 0 0 18px; font-size: 12px; color: var(--bc-text-2); }
.notice { width: 100%; display: flex; align-items: flex-start; gap: 12px; border: 1px solid transparent; text-align: left; cursor: pointer; }
.notice.unread { border-color: var(--bc-primary-soft); }
.notice-icon { flex: none; display: grid; place-items: center; width: 38px; height: 38px; border-radius: 12px; background: var(--bc-primary-soft); color: var(--bc-primary-dark); }
.notice-icon.important { background: var(--bc-warn-soft); color: var(--bc-warn); }
.notice-title { display: flex; align-items: flex-start; gap: 8px; font-size: 14px; }
.notice-title strong { flex: 1; }
.unread-dot { width: 7px; height: 7px; flex: none; border-radius: 50%; margin-top: 7px; background: var(--bc-primary); }
.notice-body { margin: 6px 0 10px; color: var(--bc-text-2); font-size: 13px; line-height: 1.7; overflow-wrap: anywhere; }
time { color: var(--bc-text-3); font-size: 12px; }
.arrow { align-self: center; color: var(--bc-text-3); }
</style>
