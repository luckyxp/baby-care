<!-- ==========================================================================
  登录 / 注册 / 一键体验
  ----------------------------------------------------------------------------
  一键体验：本地生成"育儿嫂 + 妈妈 + 爸爸"三个演示账号和一周的真实感数据，
  在另一个标签页选择其他身份登录，即可直观体验三方实时同步。
=========================================================================== -->
<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { RELATION_LABEL } from '@/shared/constants'
import { DEMO_ACCOUNTS, ensureDemo, type DemoAccount } from '@/cloud/demo'
import { useSession } from '@/stores/session'
import { useAction } from '@/composables/useAction'

const session = useSession()
const route = useRoute()
const router = useRouter()
const { busy, run } = useAction()

// 相对 index.html 解析（public 资源不经模块转换，支持部署在任意子目录）
const LOGO = './favicon.svg'

const mode = ref<'login' | 'register'>('login')
const form = reactive({ phone: '', password: '', nickname: '' })
const demoBusy = ref('')

const inviting = computed(() => String(route.query.redirect ?? '').includes('code='))
const target = computed(() => String(route.query.redirect ?? '/home'))

async function submit() {
  const ok = await run(async () => {
    if (mode.value === 'login') {
      await session.login(form.phone, form.password)
    } else {
      await session.register({ ...form })
    }
    return true
  })
  if (ok) {
    await router.replace(target.value)
  }
}

async function tryDemo(a: DemoAccount) {
  demoBusy.value = a.relation
  const ok = await run(async () => {
    await ensureDemo()
    await session.login(a.phone, a.password)
    return true
  })
  demoBusy.value = ''
  if (ok) {
    await router.replace('/home')
  }
}
</script>

<template>
  <div class="page login">
    <header class="hero">
      <img class="logo" :src="LOGO" alt="" />
      <h1>宝宝护理</h1>
      <p>家庭协同 · 每日照护</p>
    </header>

    <div class="page-body">
      <div class="card">
        <div v-if="inviting" class="pill pill--primary invite-tip">登录或注册后加入家庭</div>
        <van-tabs v-model:active="mode" shrink>
          <van-tab title="登录" name="login" />
          <van-tab title="注册" name="register" />
        </van-tabs>
        <van-form class="form" @submit="submit">
          <van-field v-model="form.phone" type="tel" maxlength="11" label="手机号" placeholder="11 位手机号" autocomplete="username" />
          <van-field v-model="form.password" type="password" label="密码" placeholder="至少 6 位" autocomplete="current-password" />
          <van-field v-if="mode === 'register'" v-model="form.nickname" label="昵称" maxlength="12" placeholder="如 王阿姨 / 小美" />
          <van-button class="submit" round block type="primary" native-type="submit" :loading="busy && !demoBusy">
            {{ mode === 'login' ? '登录' : '注册' }}
          </van-button>
        </van-form>
      </div>

      <div class="card demo">
        <div class="card-title">体验演示 <small>选择身份</small></div>
        <div class="demo-grid">
          <button
            v-for="a in DEMO_ACCOUNTS"
            :key="a.relation"
            type="button"
            class="demo-btn"
            :disabled="!!demoBusy"
            @click="tryDemo(a)"
          >
            <span class="demo-avatar"><van-icon name="user-o" size="24" /></span>
            <strong>{{ RELATION_LABEL[a.relation] }}</strong>
            <small>{{ a.nickname }}</small>
            <van-loading v-if="demoBusy === a.relation" size="16" />
          </button>
        </div>
      </div>

      <p class="muted small center">数据仅保存在当前浏览器</p>
    </div>
  </div>
</template>

<style scoped>
.login {
  background: var(--bc-bg);
}

.hero {
  padding: calc(48px + env(safe-area-inset-top)) var(--sp-6) var(--sp-6);
  text-align: center;
}

.logo {
  width: 52px;
  height: 52px;
  border-radius: 14px;
}

.hero h1 {
  margin: var(--sp-3) 0 var(--sp-1);
  font-size: 26px;
}

.hero p {
  margin: 0;
  color: var(--bc-text-2);
}

.invite-tip {
  margin-bottom: var(--sp-2);
  white-space: normal;
}

.form {
  margin-top: var(--sp-2);
}

.submit {
  margin-top: var(--sp-4);
}

.small {
  font-size: 12px;
  margin: var(--sp-3) 0 0;
}

.center {
  text-align: center;
}

.demo-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--sp-2);
}

.demo-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: var(--sp-3) 0;
  border: 1px solid var(--bc-border);
  border-radius: var(--bc-radius);
  background: var(--bc-surface);
  cursor: pointer;
}

.demo-btn:disabled {
  opacity: 0.6;
}

.demo-btn small {
  color: var(--bc-text-3);
  font-size: 12px;
}

.demo-avatar {
  padding: 8px 0;
  color: var(--bc-text-2);
}
</style>
