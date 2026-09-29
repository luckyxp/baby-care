<!-- ==========================================================================
  本机邀请演示：展示邀请码与链接，并明确纯静态版本不跨设备共享数据
=========================================================================== -->
<script setup lang="ts">
import { computed } from 'vue'
import { showToast } from 'vant'
import type { Invite } from '@/shared/types'
import { RELATION_LABEL } from '@/shared/constants'
import { copyText } from '@/utils/clipboard'
import { dayjs } from '@/utils/time'

const props = defineProps<{ invite: Invite | null }>()
const show = defineModel<boolean>('show', { required: true })
const link = computed(() => props.invite ? `${location.origin}${location.pathname}#/join?code=${props.invite.code}` : '')

async function copy(value: string) {
  showToast(await copyText(value) ? '已复制，仅限本浏览器演示使用' : '复制失败，请长按邀请码手动复制')
}
</script>

<template>
  <van-popup v-model:show="show" position="bottom" round closeable teleport="body" class="invite-popup">
    <div v-if="invite" class="sheet invite-sheet">
      <div class="invite-icon" aria-hidden="true">💌</div>
      <h2>邀请{{ RELATION_LABEL[invite.relation] }}加入</h2>
      <span class="pill pill--warn">本机演示邀请码</span>
      <div class="code" aria-label="邀请码">{{ invite.code }}</div>
      <p class="expiry">有效期至 {{ dayjs(invite.expiresAt).format('M月D日 HH:mm') }} · 仅可使用一次</p>
      <div class="notice">
        <strong>当前没有连接真实服务器</strong>
        <p>请在<strong>同一浏览器、同一站点</strong>的新标签页中打开演示链接，使用另一个本机账号加入。其他手机、其他浏览器或无痕窗口无法使用这里的邀请码，也不会看到本机数据。</p>
      </div>
      <div class="sheet-actions">
        <van-button round plain type="primary" @click="copy(invite.code)">复制邀请码</van-button>
        <van-button round type="primary" @click="copy(link)">复制演示链接</van-button>
      </div>
    </div>
  </van-popup>
</template>

<style scoped>
.invite-popup {
  max-width: var(--bc-max-w);
  left: 50%;
  transform: translateX(-50%);
}
.invite-sheet { text-align: center; padding-top: 30px; }
.invite-icon { font-size: 44px; }
h2 { font-size: 21px; margin: 8px 0 10px; }
.code { margin: 24px 0 6px; font-size: 38px; font-weight: 700; letter-spacing: 7px; color: var(--bc-primary-dark); font-variant-numeric: tabular-nums; user-select: text; }
.expiry { color: var(--bc-text-2); font-size: 12px; }
.notice { margin-top: 20px; padding: 14px; text-align: left; border-radius: var(--bc-radius); background: var(--bc-warn-soft); color: var(--bc-text-2); font-size: 13px; line-height: 1.7; }
.notice p { margin: 6px 0 0; }
</style>
