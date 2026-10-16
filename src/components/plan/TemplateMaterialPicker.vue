<!-- =======================================================================
  日模板素材选择：一次加入多项早教、亲子或辅食，操作只改变编辑中的模板草稿。
======================================================================= -->
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { showConfirmDialog } from 'vant'
import { EDU_CATEGORIES, EDU_KEYS } from '@/shared/constants'
import type { EduCategory, Slot, TemplateKind } from '@/shared/types'
import { EDU_ACTIVITIES, INTERACTIONS, RECIPES, inRange } from '@/library'
import { isRecipe, type LibraryPick } from '@/services/plan'
import ChipGroup from '@/components/ChipGroup.vue'
import AppSheet from '@/components/AppSheet.vue'
import LibraryCard from './LibraryCard.vue'

const props = defineProps<{ months: number; addedIds: string[]; kind: TemplateKind }>()
const show = defineModel<boolean>('show', { required: true })
const emit = defineEmits<{ pick: [item: LibraryPick, slot: Slot] }>()
const tab = ref('edu')
const search = ref('')
const allAges = ref(false)
const category = ref<EduCategory | 'all'>('all')
const slot = ref<Slot>('day')
const checking = ref(false)
const categoryOptions = [{ value: 'all', label: '全部领域' }, ...EDU_KEYS.map((key) => ({ value: key, label: EDU_CATEGORIES[key].label }))]
const slotOptions = [{ value: 'day', label: '日间' }, { value: 'evening', label: '晚间' }]
const added = computed(() => new Set(props.addedIds))
const items = computed(() => {
  const pool: LibraryPick[] = props.kind === 'feeding' ? RECIPES : tab.value === 'interaction' ? INTERACTIONS : EDU_ACTIVITIES
  return pool.filter((item) => (allAges.value || (isRecipe(item) ? item.min <= props.months : inRange(item, props.months)))
    && (isRecipe(item) || category.value === 'all' || item.category === category.value)
    && (isRecipe(item) ? `${item.name} ${item.ingredients.join(' ')}` : `${item.title} ${item.goal}`).includes(search.value.trim()))
})

watch(show, (visible) => {
  if (visible) { search.value = ''; category.value = 'all'; slot.value = 'day'; tab.value = props.kind === 'feeding' ? 'feeding' : 'edu' }
})

async function pick(item: LibraryPick) {
  if (checking.value || added.value.has(item.id)) return
  checking.value = true
  try {
    const recommended = isRecipe(item) ? item.min <= props.months : inRange(item, props.months)
    if (!recommended) {
      const confirmed = await showConfirmDialog({
        title: '不在推荐月龄范围', message: '请根据宝宝自主能力、过敏史和儿保建议判断，仍要加入日模板吗？',
      }).then(() => true).catch(() => false)
      if (!confirmed) return
    }
    emit('pick', item, slot.value)
  } finally {
    checking.value = false
  }
}
</script>

<template>
  <AppSheet v-model:show="show" :title="kind === 'feeding' ? '辅食食谱' : '早教素材'" tall>
    <div class="picker-controls">
      <van-search v-model="search" :placeholder="kind === 'feeding' ? '搜索食材或食谱' : '搜索早教或亲子互动'" />
      <van-tabs v-if="kind === 'edu'" v-model:active="tab"><van-tab name="edu" title="早教" /><van-tab name="interaction" title="亲子互动" /></van-tabs>
      <div class="picker-filter-row">
        <ChipGroup v-if="tab !== 'feeding'" v-model="slot" :options="slotOptions" segmented />
        <span v-else class="muted">{{ items.length }} 道食谱</span>
        <label class="row age-toggle"><span>全部月龄</span><van-switch v-model="allAges" size="18px" /></label>
      </div>
      <ChipGroup v-if="tab !== 'feeding'" v-model="category" :options="categoryOptions" scroll />
    </div>
    <div class="picker-items">
      <LibraryCard v-for="item in items" :key="item.id" :item="item" picking :added="added.has(item.id)" :loading="checking" @pick="pick" />
      <van-empty v-if="!items.length" description="没有匹配的素材" />
    </div>
  </AppSheet>
</template>

<style scoped>
.picker-controls { position: sticky; z-index: 2; top: -20px; margin-top: -20px; padding-top: 8px; padding-bottom: 8px; background: var(--bc-surface); }
.picker-controls :deep(.van-search) { padding-bottom: 4px; }
.picker-filter-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-top: 8px; font-size: 12px; }
.picker-filter-row :deep(.chips) { width: 124px; }
.age-toggle { font-size: 12px; color: var(--bc-text-2); min-height: 44px; }
.picker-items { margin: 0 -20px; }
.picker-items > * + * { border-top: 1px solid var(--bc-border); }
</style>
