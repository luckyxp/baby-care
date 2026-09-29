<!-- ==========================================================================
  宝宝档案：育儿嫂编辑、家长只读，展示自动匹配的月龄阶段与默认作息
=========================================================================== -->
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { showToast } from 'vant'
import PageNav from '@/components/PageNav.vue'
import BabyForm from '@/components/family/BabyForm.vue'
import { FEED_KIND_META } from '@/shared/constants'
import type { BabyInput } from '@/shared/types'
import { update } from '@/db/repo'
import { useSession } from '@/stores/session'
import { useAction } from '@/composables/useAction'
import { useClock } from '@/composables/useClock'
import { stageOf } from '@/library'
import { ageOf, ageText } from '@/utils/time'

const session = useSession()
const { now } = useClock()
const { busy, run } = useAction()
const formRef = ref<InstanceType<typeof BabyForm> | null>(null)
const model = ref<BabyInput>({ name: '', gender: 'girl', birthday: '', feedingMode: 'mixed', birthWeight: null, birthHeight: null, allergies: '' })
const loadedId = ref('')

watch(() => session.baby, (b) => {
  if (b && loadedId.value !== b.id) {
    model.value = { name: b.name, gender: b.gender, birthday: b.birthday, feedingMode: b.feedingMode, birthWeight: b.birthWeight, birthHeight: b.birthHeight, allergies: b.allergies }
    loadedId.value = b.id
  }
}, { immediate: true })

const age = computed(() => ageOf(model.value.birthday || '2000-01-01', now.value))
const stage = computed(() => stageOf(age.value.monthsFloat))
const schedule = computed(() => session.baby?.schedule ?? stage.value.schedule)

async function save() {
  const error = formRef.value?.validate()
  if (error) {
    showToast(error)
    return
  }
  if (!session.isAdmin || !session.baby) {
    return
  }
  await run(() => update('babies', { id: session.baby!.id, ...model.value, name: model.value.name.trim(), allergies: model.value.allergies.trim() }), '宝宝档案已保存')
}
</script>

<template>
  <div class="page baby-page">
    <PageNav />
    <div v-if="session.baby" class="page-body">
      <header class="baby-summary">
        <div class="baby-avatar" aria-hidden="true">{{ session.baby.avatar || '👶' }}</div>
        <h1>{{ model.name || '宝宝' }}</h1>
        <p>{{ ageText(age) }} <span class="pill pill--primary">{{ stage.title }}</span></p>
      </header>
      <section class="card">
        <div v-if="!session.isAdmin" class="read-only"><van-icon name="lock" /> 档案由育儿嫂维护，当前为只读查看</div>
        <BabyForm ref="formRef" v-model="model" :readonly="!session.isAdmin" />
        <van-button v-if="session.isAdmin" class="save" round block type="primary" :loading="busy" @click="save">保存档案</van-button>
      </section>
      <div class="section-title">默认喂养作息 <span class="pill">{{ session.baby.schedule ? '自定义' : '月龄参考' }}</span></div>
      <section class="card schedule-card">
        <div v-for="(s, index) in schedule" :key="index" class="schedule-row">
          <time>{{ s.time }}</time><span>{{ FEED_KIND_META[s.kind].icon }}</span><span class="grow">{{ s.title }}</span><strong v-if="s.amount !== null">{{ s.amount }}ml</strong>
        </div>
        <p class="footnote">育儿嫂可在计划页调整，并保存为默认作息。月龄方案仅作日常参考，不代替儿保医生建议；以宝宝状态与实际需要为准。</p>
        <router-link v-if="session.isAdmin" class="link plan-link" to="/plan">去计划页调整 <van-icon name="arrow" /></router-link>
      </section>
    </div>
    <van-empty v-else description="还没有宝宝档案" />
  </div>
</template>

<style scoped>
.baby-summary { text-align: center; padding: 24px 0 20px; }
.baby-avatar { width: 74px; height: 74px; border-radius: 24px; display: grid; place-items: center; font-size: 42px; margin: 0 auto 10px; background: var(--bc-primary-soft); }
h1 { margin: 0; font-size: 23px; }
.baby-summary p { color: var(--bc-text-2); margin: 8px 0 0; }
.baby-summary .pill { margin-left: 8px; }
.read-only { padding: 10px 12px; margin-bottom: 16px; background: var(--bc-surface-2); color: var(--bc-text-2); border-radius: 10px; font-size: 12px; }
.save { margin-top: 24px; }
.schedule-row { display: flex; align-items: center; gap: 10px; padding: 11px 0; border-bottom: 1px solid var(--bc-border); }
.schedule-row time { font-variant-numeric: tabular-nums; font-weight: 600; color: var(--bc-text-2); }
.schedule-row strong { font-size: 13px; color: var(--bc-primary-dark); }
.footnote { color: var(--bc-text-2); font-size: 12px; line-height: 1.7; margin: 16px 0 0; }
.plan-link { display: inline-flex; align-items: center; gap: 6px; padding-top: 14px; text-decoration: none; }
</style>
