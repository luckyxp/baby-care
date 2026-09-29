<!-- ==========================================================================
  早教 / 亲子任务卡
  ----------------------------------------------------------------------------
  收起：类别标签 · 标题 · 时长 · 打卡状态
  展开：目标、材料、步骤、观察要点、打卡详情、家人备注
  编辑模式（仅育儿嫂）：换一个 / 编辑 / 删除
=========================================================================== -->
<script setup lang="ts">
import { computed } from 'vue'
import { EDU_CATEGORIES, RATING_ICON, RATING_LABEL, SLOT_LABEL } from '@/shared/constants'
import type { Checkin, EduCategory, PlanTask } from '@/shared/types'
import { libraryOf } from '@/domain/planner'
import { hm } from '@/utils/time'
import AuthorTag from '@/components/AuthorTag.vue'
import NoteThread from '@/components/NoteThread.vue'

const props = defineProps<{
  task: PlanTask
  checkin?: Checkin
  expanded: boolean
  editing: boolean
  canCheckin: boolean
  canUndo: boolean
  locked: boolean
  notes: number
}>()

defineEmits<{
  toggle: []
  checkin: []
  undo: []
  swap: []
  edit: []
  remove: []
}>()

const cat = computed(() => EDU_CATEGORIES[props.task.category as EduCategory])
const item = computed(() => libraryOf(props.task))
const detail = computed(() => {
  const it = item.value
  if (!it || 'ingredients' in it) {
    return { duration: null, materials: [] as string[], hint: '' }
  }
  return { duration: it.duration, materials: it.materials, hint: 'observe' in it ? it.observe : it.tip }
})
const evening = computed(() => props.task.slot === 'evening')
</script>

<template>
  <div :id="`task-${task.id}`" class="task" :class="{ 'task--done': checkin, 'task--evening': evening }">
    <div class="head" role="button" tabindex="0" :aria-expanded="expanded" @click="$emit('toggle')" @keyup.enter="$emit('toggle')">
      <div class="grow">
        <div class="tags">
          <span v-if="cat" class="cat" :style="{ color: cat.color, background: cat.color + '1f' }">{{ cat.icon }} {{ cat.label }}</span>
          <span v-if="task.kind === 'interaction'" class="pill">{{ evening ? '🌙' : '☀️' }} {{ SLOT_LABEL[task.slot] }}亲子</span>
          <span v-if="detail.duration" class="pill">⏱ {{ detail.duration }}分钟</span>
          <span v-if="!task.sourceId" class="pill">自定义</span>
        </div>
        <div class="title">{{ task.title }}</div>
        <div v-if="checkin" class="done-line">
          <span class="rating">{{ RATING_ICON[checkin.rating] }} {{ RATING_LABEL[checkin.rating] }}</span>
          <AuthorTag :user-id="checkin.createdBy" :suffix="hm(checkin.createdAt)" />
        </div>
      </div>
      <div class="side">
        <van-button v-if="!checkin && canCheckin && !locked && !editing" size="small" round type="primary" @click.stop="$emit('checkin')">打卡</van-button>
        <span v-else-if="checkin" class="check">✓</span>
        <span v-else-if="!canCheckin && !editing" class="muted small">{{ evening ? '等爸妈完成' : '由育儿嫂完成' }}</span>
        <span v-if="notes" class="pill pill--primary">💬 {{ notes }}</span>
      </div>
    </div>

    <div v-if="editing" class="edit-bar">
      <button v-if="task.sourceId && !checkin" type="button" class="link" @click="$emit('swap')"><van-icon name="replay" /> 换一个</button>
      <button type="button" class="link" @click="$emit('edit')"><van-icon name="edit" /> 编辑</button>
      <button type="button" class="link danger" @click="$emit('remove')"><van-icon name="delete-o" /> 删除</button>
    </div>

    <div v-if="expanded" class="body">
      <p v-if="task.desc" class="goal">🎯 {{ task.desc }}</p>
      <div v-if="detail.materials.length" class="materials">
        <span class="muted">准备：</span>
        <span v-for="m in detail.materials" :key="m" class="pill">{{ m }}</span>
      </div>
      <ol v-if="task.steps.length" class="steps">
        <li v-for="(s, i) in task.steps" :key="i">{{ s }}</li>
      </ol>
      <p v-if="detail.hint" class="hint">👀 {{ detail.hint }}</p>

      <div v-if="checkin" class="checkin">
        <div v-if="checkin.tags.length" class="tag-row">
          <span v-for="t in checkin.tags" :key="t" class="pill pill--accent">{{ t }}</span>
          <span v-if="checkin.duration" class="pill">实际 {{ checkin.duration }} 分钟</span>
        </div>
        <p v-if="checkin.note" class="ck-note">{{ checkin.note }}</p>
        <button v-if="canUndo && !editing" type="button" class="link small" @click="$emit('undo')">撤销打卡</button>
      </div>

      <div class="form-label">家人备注</div>
      <NoteThread target-type="task" :target-id="task.id" :date="task.date" placeholder="补充宝宝的表现或想法…" />
    </div>
  </div>
</template>

<style scoped>
.task {
  background: var(--bc-surface);
  border-radius: var(--bc-radius);
  box-shadow: var(--bc-shadow);
  padding: var(--sp-3) var(--sp-4);
  margin-bottom: var(--sp-2);
  border-left: 4px solid transparent;
}

.task--done {
  border-left-color: var(--bc-accent);
}

.task--evening {
  background: linear-gradient(135deg, #2e2a55, #413a77);
  color: #f1eefe;
}

.task--evening .muted,
.task--evening .hint,
.task--evening .goal {
  color: #cfc8f5;
}

.task--evening .pill {
  background: rgba(255, 255, 255, 0.14);
  color: #ece8ff;
}

.task--evening .form-label {
  color: #cfc8f5;
}

.head {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  cursor: pointer;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 4px;
}

.cat {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
}

.task--evening .cat {
  background: rgba(255, 255, 255, 0.9) !important;
}

.title {
  font-size: 15px;
  font-weight: 600;
}

.done-line {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  margin-top: 4px;
}

.rating {
  font-size: 13px;
  font-weight: 600;
}

.side {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  flex: none;
}

.check {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--bc-accent);
  color: #fff;
  font-weight: 700;
}

.small {
  font-size: 12px;
}

.edit-bar {
  display: flex;
  gap: var(--sp-4);
  margin-top: var(--sp-2);
  padding-top: var(--sp-2);
  border-top: 1px dashed var(--bc-border);
}

.edit-bar .link {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  min-height: 32px;
  font-size: 13px;
}

.task--evening .link {
  color: #ffd2c8;
}

.danger {
  color: var(--bc-danger);
}

.body {
  margin-top: var(--sp-3);
  font-size: 13px;
}

.goal,
.hint {
  margin: 0 0 var(--sp-2);
  color: var(--bc-text-2);
}

.materials {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-bottom: var(--sp-2);
}

.steps {
  margin: 0 0 var(--sp-2);
  padding-left: 20px;
  line-height: 1.7;
}

.checkin {
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--bc-radius-sm);
  background: var(--bc-accent-soft);
  color: var(--bc-text);
}

.tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.ck-note {
  margin: 6px 0 0;
  white-space: pre-wrap;
}
</style>
