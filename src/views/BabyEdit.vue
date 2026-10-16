<!-- ==========================================================================
  宝宝档案：育儿嫂编辑、家长只读，展示自动匹配的月龄阶段
=========================================================================== -->
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { showToast } from 'vant'
import PageNav from '@/components/PageNav.vue'
import BabyForm from '@/components/family/BabyForm.vue'
import AppIcon from '@/components/AppIcon.vue'
import type { BabyInput } from '@/shared/types'
import { update } from '@/db/repo'
import { refreshUpcomingPlans } from '@/services/plan'
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

async function save() {
  const error = formRef.value?.validate()
  if (error) {
    showToast(error)
    return
  }
  if (!session.isAdmin || !session.baby) {
    return
  }
  const birthdayChanged = session.baby.birthday !== model.value.birthday
  await run(async () => {
    const saved = await update('babies', {
      id: session.baby!.id, ...model.value, name: model.value.name.trim(), allergies: model.value.allergies.trim(),
    })
    if (birthdayChanged) {
      await refreshUpcomingPlans(saved)
    }
  }, birthdayChanged ? '档案已保存，后续计划已按新月龄更新' : '宝宝档案已保存')
}
</script>

<template>
  <div class="page baby-page">
    <PageNav><template #right><button v-if="session.isAdmin" type="button" class="nav-action nav-action--primary" :disabled="busy" @click="save"><van-loading v-if="busy" size="16" /><span v-else>保存</span></button></template></PageNav>
    <div v-if="session.baby" class="page-body">
      <header class="baby-summary">
        <div class="baby-avatar" aria-hidden="true"><span v-if="session.baby.avatar">{{ session.baby.avatar }}</span><AppIcon v-else name="baby" :size="28" /></div>
        <div><h1>{{ model.name || '宝宝' }}</h1><p>{{ ageText(age) }} · {{ stage.title }}</p></div>
      </header>
      <section class="card">
        <div v-if="!session.isAdmin" class="read-only"><van-icon name="lock" /> 档案由育儿嫂维护，当前为只读查看</div>
        <BabyForm ref="formRef" v-model="model" :readonly="!session.isAdmin" />
      </section>
    </div>
    <van-empty v-else description="还没有宝宝档案" />
  </div>
</template>

<style scoped>
.baby-summary { display: flex; align-items: center; gap: 12px; padding: 24px 0; }
.baby-avatar { width: 48px; height: 48px; border-radius: 14px; display: grid; place-items: center; font-size: 30px; color: var(--bc-text-2); background: var(--bc-surface-2); }
h1 { margin: 0; font-size: 22px; font-weight: 600; }
.baby-summary p { color: var(--bc-text-3); font-size: 12px; margin: 4px 0 0; }
.baby-summary .pill { margin-left: 8px; }
.read-only { padding: 10px 12px; margin-bottom: 16px; background: var(--bc-surface-2); color: var(--bc-text-2); border-radius: 10px; font-size: 12px; }
</style>
