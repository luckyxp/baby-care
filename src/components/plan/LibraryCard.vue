<!-- ==========================================================================
  素材卡片：统一展示早教、亲子与食谱；详情按素材类型展开，挑选模式可加入计划
=========================================================================== -->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { EDU_CATEGORIES } from '@/shared/constants'
import type { EduActivity, Interaction, Recipe } from '@/library'
import { isRecipe, type LibraryPick } from '@/services/plan'

const props = defineProps<{ item: LibraryPick; picking: boolean; loading?: boolean; added?: boolean }>()
defineEmits<{ pick: [item: LibraryPick] }>()
const open = ref(false)
const recipe = computed<Recipe | null>(() => isRecipe(props.item) ? props.item : null)
const activity = computed<EduActivity | Interaction | null>(() => !isRecipe(props.item) ? props.item : null)
const category = computed(() => activity.value ? EDU_CATEGORIES[activity.value.category] : null)
const title = computed(() => recipe.value?.name ?? activity.value?.title ?? '')
const ageRange = computed(() => activity.value ? `${activity.value.min}-${activity.value.max}月龄` : `${props.item.min}月龄起`)
</script>

<template>
  <article class="card library-card">
    <button type="button" class="expand" :aria-expanded="open" @click="open = !open">
      <div class="grow">
        <div class="tags">
          <span v-if="category" class="pill" :style="{ color: category.color }">{{ category.icon }} {{ category.label }}</span>
          <span v-if="recipe" class="pill">🥣 {{ recipe.texture }}</span>
          <span class="pill">{{ ageRange }}</span>
          <span v-if="activity" class="pill">{{ activity.duration }}分钟</span>
          <span v-if="activity && 'slot' in activity" class="pill">{{ activity.slot === 'evening' ? '🌙 晚间' : '☀️ 日间' }}</span>
        </div>
        <h3>{{ title }}</h3>
        <p v-if="activity">{{ activity.goal }}</p>
        <p v-if="recipe">{{ recipe.ingredients.join('、') }}</p>
      </div>
      <van-icon :name="open ? 'arrow-up' : 'arrow-down'" />
    </button>

    <div v-if="open" class="details">
      <p v-if="activity?.materials.length"><strong>准备：</strong>{{ activity.materials.join('、') }}</p>
      <p v-if="recipe"><strong>食材：</strong>{{ recipe.ingredients.join('、') }}</p>
      <ol>
        <li v-for="(step, i) in item.steps" :key="i">{{ step }}</li>
      </ol>
      <p v-if="activity && 'observe' in activity" class="hint">👀 观察要点：{{ activity.observe }}</p>
      <p v-if="'tip' in item" class="hint">💡 {{ item.tip }}</p>
      <p v-if="recipe?.allergens.length" class="allergens">常见过敏原：{{ recipe.allergens.join('、') }}</p>
    </div>

    <div v-if="picking" class="pick-row">
      <small class="muted">{{ recipe ? '加入后可在计划页设置用餐时间' : '按所选时段加入当天计划' }}</small>
      <van-button size="small" round type="primary" :loading="loading" :disabled="added" @click="$emit('pick', item)">
        {{ added ? '已在计划中' : '加入计划' }}
      </van-button>
    </div>
  </article>
</template>

<style scoped>
.expand {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  width: 100%;
  padding: 0;
  border: 0;
  background: none;
  text-align: left;
  cursor: pointer;
}
.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
h3 {
  margin: 8px 0 4px;
  font-size: 16px;
}
p {
  margin: 4px 0;
  font-size: 13px;
  color: var(--bc-text-2);
}
.details {
  padding-top: var(--sp-3);
  margin-top: var(--sp-3);
  border-top: 1px dashed var(--bc-border);
}
ol {
  padding-left: 20px;
  margin: 8px 0;
  font-size: 13px;
  line-height: 1.8;
}
.hint {
  padding: 8px 12px;
  background: var(--bc-surface-2);
  border-radius: var(--bc-radius-sm);
}
.allergens {
  color: var(--bc-danger);
}
.pick-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
}
.pick-row small {
  flex: 1;
  min-width: 0;
}
</style>
