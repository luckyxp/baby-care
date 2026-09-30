<!-- ==========================================================================
  素材库：早教 / 亲子互动 / 喂养；默认按宝宝月龄筛选，也可浏览全部月龄
  ----------------------------------------------------------------------------
  ?pick=1&date=YYYY-MM-DD&slot=day|evening 开启挑选模式，仅育儿嫂可加入计划。
  家长可浏览素材，但不能调整计划。所有内容为参考，不替代儿保建议。
=========================================================================== -->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showConfirmDialog } from 'vant'
import { EDU_CATEGORIES, EDU_KEYS } from '@/shared/constants'
import type { EduCategory, Slot } from '@/shared/types'
import {
  EDU_ACTIVITIES, INTERACTIONS, FOODS, RECIPES, FEEDING_PRINCIPLES,
  careGuidesFor, eduFor, interactionsFor, recipesFor, stageOf, type CareGuide, type FoodGroup,
} from '@/library'
import { useSession } from '@/stores/session'
import { useDay } from '@/composables/useDay'
import { useAction } from '@/composables/useAction'
import { useClock } from '@/composables/useClock'
import { addFromLibrary, isRecipe, type LibraryPick } from '@/services/plan'
import { ageOf, ageText, dayjs } from '@/utils/time'
import PageNav from '@/components/PageNav.vue'
import ChipGroup from '@/components/ChipGroup.vue'
import LibraryCard from '@/components/plan/LibraryCard.vue'
import StagePanel from '@/components/plan/StagePanel.vue'

const route = useRoute()
const router = useRouter()
const session = useSession()
const { today } = useClock()
const { busy, run } = useAction()

const tab = ref(route.query.tab === 'feeding' ? 'feeding' : route.query.slot === 'evening' ? 'interaction' : 'edu')
const allAges = ref(true)
const search = ref('')
const category = ref<EduCategory | 'all'>('all')
const interactionSlot = ref<Slot | 'all'>(route.query.slot === 'evening' ? 'evening' : 'all')
const targetSlot = ref<Slot>(route.query.slot === 'evening' ? 'evening' : 'day')
const date = computed(() => typeof route.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(route.query.date) && dayjs(route.query.date).format('YYYY-MM-DD') === route.query.date
  ? route.query.date : today.value)
const day = useDay(date)
const picking = computed(() => route.query.pick === '1' && session.isAdmin)
const age = computed(() => ageOf(session.baby?.birthday ?? today.value, date.value))
const stage = computed(() => stageOf(age.value.monthsFloat))
const added = computed(() => new Set(day.tasks.value.map((t) => t.sourceId)))
const selecting = ref('')

const categoryOptions = [
  { value: 'all' as const, label: '全部领域' },
  ...EDU_KEYS.map((k) => ({ value: k, label: EDU_CATEGORIES[k].label, icon: EDU_CATEGORIES[k].icon })),
]
const slotOptions = [
  { value: 'all' as const, label: '全部时段' },
  { value: 'day' as const, label: '☀️ 日间' },
  { value: 'evening' as const, label: '🌙 晚间' },
]
const targetOptions = slotOptions.filter((s) => s.value !== 'all')
const matches = (text: string) => text.toLowerCase().includes(search.value.trim().toLowerCase())
const eduItems = computed(() => (allAges.value ? EDU_ACTIVITIES : eduFor(age.value.monthsFloat))
  .filter((a) => (category.value === 'all' || a.category === category.value) && matches(`${a.title} ${a.goal}`)))
const interactionItems = computed(() => (allAges.value ? INTERACTIONS : interactionsFor(age.value.monthsFloat))
  .filter((a) => (interactionSlot.value === 'all' || a.slot === interactionSlot.value) && matches(`${a.title} ${a.goal}`)))
const recipes = computed(() => (allAges.value ? RECIPES : recipesFor(age.value.monthsFloat))
  .filter((r) => matches(`${r.name} ${r.ingredients.join(' ')}`)))
const careGuides = computed(() => careGuidesFor(age.value.monthsFloat)
  .filter((guide) => matches(`${guide.title} ${guide.summary} ${guide.points.join(' ')}`)))
const openGuide = ref('')

const GUIDE_CATEGORY: Record<CareGuide['category'], string> = {
  sleep: '睡眠', care: '日常护理', feeding: '喂养', safety: '安全',
}

const GROUP_LABEL: Record<FoodGroup, string> = {
  grain: '谷薯类', veg: '蔬菜类', fruit: '水果及其他', meat: '畜禽肉类',
  egg: '蛋类', fish: '鱼虾类', bean: '大豆与坚果', dairy: '奶制品',
}
const foodGroups = computed(() => (Object.keys(GROUP_LABEL) as FoodGroup[])
  .map((group) => ({ group, label: GROUP_LABEL[group], foods: FOODS.filter((f) => f.group === group && matches(f.name)) }))
  .filter((g) => g.foods.length))
const foodDetail = ref('')
const showFoods = ref(false)
const showPrinciples = ref(false)

async function pick(item: LibraryPick) {
  const baby = session.baby
  if (!baby || !picking.value || busy.value || added.value.has(item.id)) {
    return
  }
  const recommended = item.min <= age.value.monthsFloat && (isRecipe(item) || age.value.monthsFloat < item.max)
  if (!recommended) {
    const confirmed = await showConfirmDialog({
      title: '不在推荐月龄范围', message: '这项素材不适合当前月龄范围。请根据宝宝能力、过敏史与儿保建议判断，仍要加入吗？',
    }).then(() => true).catch(() => false)
    if (!confirmed) {
      return
    }
  }
  selecting.value = item.id
  const task = await run(() => addFromLibrary(baby, date.value, item, targetSlot.value), '已加入计划')
  selecting.value = ''
  if (task) {
    await router.replace({ path: '/plan', query: { date: date.value, task: task.id } })
  }
}
</script>

<template>
  <div class="page library-page">
    <PageNav title="素材库" />
    <main class="page-body">
      <div v-if="picking" class="card pick-banner">
        <strong>为 {{ dayjs(date).format('M月D日') }} 挑选任务</strong>
        <div v-if="tab !== 'feeding'" class="row slot-select">
          <span>加入时段</span><ChipGroup v-model="targetSlot" :options="targetOptions" />
        </div>
        <small>日间由育儿嫂安排，晚间互动留给爸爸妈妈。食谱加入后可编辑用餐时间。</small>
      </div>
      <div class="age-filter row row--between">
        <span>宝宝 {{ ageText(age) }}</span>
        <label class="row"><span>全部月龄</span><van-switch v-model="allAges" size="22px" /></label>
      </div>
      <van-search v-model="search" placeholder="搜索活动、食材或食谱" shape="round" background="transparent" />
      <van-tabs v-model:active="tab" shrink animated>
        <van-tab name="edu" title="早教">
          <div class="filter"><ChipGroup v-model="category" :options="categoryOptions" /></div>
          <p class="count muted">{{ eduItems.length }} 项活动 · 点击卡片查看步骤与观察要点</p>
          <LibraryCard
            v-for="item in eduItems" :key="item.id" :item="item" :picking="picking"
            :loading="busy && selecting === item.id" :added="added.has(item.id)" @pick="pick"
          />
          <van-empty v-if="!eduItems.length" image-size="80" description="没有匹配的活动，可切换月龄范围或搜索词" />
        </van-tab>
        <van-tab name="interaction" title="亲子互动">
          <div class="filter"><ChipGroup v-model="interactionSlot" :options="slotOptions" /></div>
          <p class="count muted">{{ interactionItems.length }} 项互动 · 陪伴比完成任务更重要</p>
          <LibraryCard
            v-for="item in interactionItems" :key="item.id" :item="item" :picking="picking"
            :loading="busy && selecting === item.id" :added="added.has(item.id)" @pick="pick"
          />
          <van-empty v-if="!interactionItems.length" image-size="80" description="没有匹配的互动，可切换月龄范围或搜索词" />
        </van-tab>
        <van-tab name="feeding" title="喂养">
          <div class="feeding-top"><StagePanel :stage="stage" :age-text="ageText(age)" /></div>
          <div class="card">
            <button type="button" class="section-toggle" :aria-expanded="showPrinciples" @click="showPrinciples = !showPrinciples">
              <strong>🥣 喂养原则</strong><van-icon :name="showPrinciples ? 'arrow-up' : 'arrow-down'" />
            </button>
            <ol v-if="showPrinciples" class="principles"><li v-for="p in FEEDING_PRINCIPLES" :key="p">{{ p }}</li></ol>
          </div>
          <div class="card">
            <button type="button" class="section-toggle" :aria-expanded="showFoods" @click="showFoods = !showFoods">
              <strong>🥕 食材库 <small>{{ FOODS.length }} 种</small></strong><van-icon :name="showFoods ? 'arrow-up' : 'arrow-down'" />
            </button>
            <template v-if="showFoods">
              <p class="count muted">标「敏」为常见过敏原；灰色食材尚未到推荐月龄。点击查看处理方式。</p>
              <section v-for="g in foodGroups" :key="g.group" class="food-group">
                <h4>{{ g.label }}</h4>
                <div class="foods">
                  <button
                    v-for="food in g.foods" :key="food.name" type="button" class="food"
                    :class="{ later: food.min > age.monthsFloat }" :aria-pressed="foodDetail === food.name"
                    @click="foodDetail = foodDetail === food.name ? '' : food.name"
                  >
                    {{ food.name }}<span v-if="food.allergen" class="allergen">敏</span>
                    <small v-if="food.min > age.monthsFloat">{{ food.min }}月起</small>
                  </button>
                </div>
                <p v-if="g.foods.some((f) => f.name === foodDetail)" class="food-tip">
                  {{ g.foods.find((f) => f.name === foodDetail)?.tip }}
                </p>
              </section>
              <p v-if="!foodGroups.length" class="muted">没有匹配的食材</p>
            </template>
          </div>
          <div class="section-title">月龄食谱 <small class="muted">{{ recipes.length }} 道</small></div>
          <LibraryCard
            v-for="item in recipes" :key="item.id" :item="item" :picking="picking"
            :loading="busy && selecting === item.id" :added="added.has(item.id)" @pick="pick"
          />
          <van-empty v-if="!recipes.length" image-size="80" :description="age.monthsFloat < 6 && !allAges ? '当前月龄以奶为主，满6月龄后再逐步添加辅食' : '没有匹配的食谱'" />
        </van-tab>
        <van-tab name="care" title="护理知识">
          <p class="count muted">{{ careGuides.length }} 条与当前月龄匹配的日常照护要点</p>
          <article v-for="guide in careGuides" :key="guide.id" class="card guide">
            <button type="button" class="section-toggle" :aria-expanded="openGuide === guide.id" @click="openGuide = openGuide === guide.id ? '' : guide.id">
              <span><small class="guide-category">{{ GUIDE_CATEGORY[guide.category] }}</small><strong>{{ guide.title }}</strong></span>
              <van-icon :name="openGuide === guide.id ? 'arrow-up' : 'arrow-down'" />
            </button>
            <p>{{ guide.summary }}</p>
            <ul v-if="openGuide === guide.id" class="guide-points"><li v-for="point in guide.points" :key="point">{{ point }}</li></ul>
          </article>
          <van-empty v-if="!careGuides.length" image-size="80" description="没有匹配的护理知识" />
        </van-tab>
      </van-tabs>
      <p class="disclaimer">素材供日常照护参考，不是医学诊断或必须达标的清单。尊重宝宝状态，活动全程有人照看，喂养及发育疑问请咨询儿保医生。</p>
    </main>
  </div>
</template>

<style scoped>
.library-page :deep(.van-tabs__nav) {
  background: transparent;
}
.pick-banner {
  margin-top: 12px;
  background: var(--bc-primary-soft);
}
.pick-banner small {
  display: block;
  margin-top: 8px;
  color: var(--bc-text-2);
}
.slot-select {
  margin-top: 8px;
  flex-wrap: wrap;
}
.age-filter {
  margin: 12px 0 0;
  font-size: 13px;
}
.filter,
.feeding-top {
  margin-top: 16px;
}
.count {
  font-size: 12px;
  margin: 12px 0;
}
.section-toggle {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  min-height: 36px;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
}
.section-toggle small {
  color: var(--bc-text-3);
  font-weight: 400;
}
.principles {
  padding-left: 22px;
  color: var(--bc-text-2);
  font-size: 13px;
  line-height: 1.8;
}
.principles li {
  margin-bottom: 6px;
}
h4 {
  margin: 12px 0 8px;
  font-size: 13px;
}
.foods {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.food {
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 36px;
  padding: 4px 10px;
  border: 1px solid var(--bc-border);
  border-radius: 12px;
  background: var(--bc-surface-2);
  font-size: 13px;
  cursor: pointer;
}
.food[aria-pressed='true'] {
  border-color: var(--bc-primary);
}
.food.later {
  background: transparent;
  color: var(--bc-text-3);
}
.food small,
.allergen {
  font-size: 11px;
}
.allergen {
  color: var(--bc-danger);
}
.food-tip {
  padding: 8px 12px;
  font-size: 13px;
  border-left: 2px solid var(--bc-primary);
  color: var(--bc-text-2);
}
.guide {
  margin-top: 12px;
}
.guide .section-toggle span {
  display: flex;
  align-items: center;
  gap: 8px;
}
.guide-category {
  display: inline-flex;
  color: var(--bc-primary-dark);
  background: var(--bc-primary-soft);
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 500;
}
.guide p {
  margin: 10px 0 0;
  color: var(--bc-text-2);
  font-size: 13px;
  line-height: 1.7;
}
.guide-points {
  margin: 10px 0 0;
  padding-left: 20px;
  color: var(--bc-text-2);
  font-size: 13px;
  line-height: 1.8;
}
.disclaimer {
  margin: 24px 0;
  font-size: 12px;
  line-height: 1.8;
  color: var(--bc-text-3);
}
</style>
