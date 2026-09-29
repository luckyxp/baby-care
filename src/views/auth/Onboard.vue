<!-- ==========================================================================
  加入引导：育儿嫂创建宝宝档案（成为管理员） / 家长输入邀请码加入家庭
=========================================================================== -->
<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { RELATION_LABEL } from '@/shared/constants'
import type { BabyInput, InvitePreview } from '@/shared/types'
import BabyForm from '@/components/family/BabyForm.vue'
import { useSession } from '@/stores/session'
import { useAction } from '@/composables/useAction'
import { transport } from '@/sync/transport'
import { dateKey, dayjs } from '@/utils/time'

const session = useSession()
const route = useRoute()
const router = useRouter()
const { busy, run } = useAction()

const mode = ref<'create' | 'join'>(route.query.code ? 'join' : 'create')
const code = ref(String(route.query.code ?? '').toUpperCase())
const preview = ref<InvitePreview | null>(null)
const previewError = ref('')
const baby = ref<BabyInput>({
  name: '', gender: 'girl', birthday: dateKey(dayjs().subtract(3, 'month')), feedingMode: 'mixed',
  birthWeight: null, birthHeight: null, allergies: '',
})
const formRef = ref<InstanceType<typeof BabyForm> | null>(null)

async function loadPreview() {
  preview.value = null
  previewError.value = ''
  if (code.value.length !== 6) {
    return
  }
  try {
    preview.value = await transport.previewInvite(code.value)
  } catch (e) {
    previewError.value = e instanceof Error ? e.message : String(e)
  }
}

watch(code, (v) => {
  code.value = v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
  void loadPreview()
})
onMounted(loadPreview)

async function create() {
  const err = formRef.value?.validate()
  if (err) {
    await run(() => Promise.reject(new Error(err)))
    return
  }
  if (await run(() => session.createFamily(baby.value).then(() => true), '宝宝档案已创建')) {
    await router.replace('/members?invite=1')
  }
}

async function join() {
  if (await run(() => session.joinFamily(code.value).then(() => true), '已加入家庭')) {
    await router.replace('/home')
  }
}

async function logout() {
  await session.logout()
  await router.replace('/login')
}
</script>

<template>
  <div class="page">
    <header class="head">
      <h2>你好，{{ session.user?.nickname }} 👋</h2>
      <p class="text-2">先告诉我们你的身份</p>
    </header>

    <div class="page-body">
      <div class="modes">
        <button type="button" class="mode" :class="{ on: mode === 'create' }" @click="mode = 'create'">
          <span class="emoji">👩‍🍼</span>
          <strong>我是育儿嫂</strong>
          <small>创建宝宝档案，邀请爸爸妈妈</small>
        </button>
        <button type="button" class="mode" :class="{ on: mode === 'join' }" @click="mode = 'join'">
          <span class="emoji">👨‍👩‍👧</span>
          <strong>我是爸爸 / 妈妈</strong>
          <small>输入育儿嫂给的邀请码</small>
        </button>
      </div>

      <div v-if="mode === 'create'" class="card">
        <div class="card-title">宝宝档案</div>
        <BabyForm ref="formRef" v-model="baby" />
        <van-button class="action" round block type="primary" :loading="busy" @click="create">创建并成为管理员</van-button>
        <p class="muted small">创建后你将拥有全部管理与编辑权限，系统会根据宝宝生日自动匹配月龄方案。</p>
      </div>

      <div v-else class="card">
        <div class="card-title">输入邀请码</div>
        <input v-model="code" class="code-input" inputmode="text" autocapitalize="characters" placeholder="6 位邀请码" maxlength="6" />
        <div v-if="preview" class="preview">
          <strong>{{ preview.inviter }}</strong> 邀请你以
          <span class="pill pill--primary">{{ RELATION_LABEL[preview.relation] }}</span>
          身份加入「{{ preview.familyName }}」
          <div class="muted small">宝宝：{{ preview.babyName }} · 有效期至 {{ dayjs(preview.expiresAt).format('M月D日 HH:mm') }}</div>
        </div>
        <div v-else-if="previewError" class="pill pill--danger err">{{ previewError }}</div>
        <van-button class="action" round block type="primary" :disabled="!preview" :loading="busy" @click="join">加入家庭</van-button>
        <p class="muted small">家长可以查看全部记录、补充备注、完成晚间亲子任务；计划与育儿嫂录入的内容由育儿嫂维护。</p>
      </div>

      <p class="center"><button class="link" type="button" @click="logout">切换账号</button></p>
    </div>
  </div>
</template>

<style scoped>
.head {
  padding: calc(32px + env(safe-area-inset-top)) var(--sp-5) var(--sp-4);
}

.head h2 {
  margin: 0 0 4px;
}

.head p {
  margin: 0;
}

.modes {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--sp-3);
  margin-bottom: var(--sp-3);
}

.mode {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding: var(--sp-4);
  border: 2px solid transparent;
  border-radius: var(--bc-radius-lg);
  background: var(--bc-surface);
  box-shadow: var(--bc-shadow);
  text-align: left;
  cursor: pointer;
}

.mode.on {
  border-color: var(--bc-primary);
  background: var(--bc-primary-soft);
}

.mode small {
  color: var(--bc-text-3);
  font-size: 12px;
}

.emoji {
  font-size: 28px;
}

.action {
  margin-top: var(--sp-5);
}

.small {
  font-size: 12px;
  margin: var(--sp-3) 0 0;
}

.code-input {
  width: 100%;
  height: 56px;
  border: 1px solid var(--bc-border);
  border-radius: var(--bc-radius);
  background: var(--bc-surface-2);
  text-align: center;
  font-size: 26px;
  font-weight: 700;
  letter-spacing: 8px;
  outline: none;
}

.code-input:focus {
  border-color: var(--bc-primary);
}

.preview {
  margin-top: var(--sp-3);
  padding: var(--sp-3);
  border-radius: var(--bc-radius-sm);
  background: var(--bc-accent-soft);
  line-height: 1.8;
}

.err {
  margin-top: var(--sp-3);
}

.center {
  text-align: center;
}
</style>
