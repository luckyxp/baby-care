<!-- ==========================================================================
  早教 / 亲子任务卡
  ----------------------------------------------------------------------------
  收起：类别标签 · 标题 · 时长 · 打卡状态
  展开：目标、材料、步骤、观察要点、打卡详情、家人备注
  编辑模式（仅育儿嫂）：换一个 / 编辑 / 删除
=========================================================================== -->
<script setup lang="ts">
import { computed } from 'vue'
import { EDU_CATEGORIES, RATING_LABEL } from '@/shared/constants'
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
    <div class="head">
      <button type="button" class="task-toggle grow" :aria-expanded="expanded" @click="$emit('toggle')">
        <div class="title">{{ task.title }}</div>
        <div class="tags"><span v-if="cat">{{ cat.label }}</span><span v-if="detail.duration">{{ detail.duration }} 分钟</span><span v-if="task.time">{{ task.time }}</span><van-icon :name="expanded ? 'arrow-up' : 'arrow-down'" size="10" /></div>
        <div v-if="checkin" class="done-line">
          <span class="rating">{{ RATING_LABEL[checkin.rating] }}</span>
          <AuthorTag :user-id="checkin.createdBy" :suffix="hm(checkin.createdAt)" />
        </div>
      </button>
      <div class="side">
        <button v-if="!checkin && canCheckin && !locked && !editing" type="button" class="checkin-button" @click.stop="$emit('checkin')"><span>打卡</span></button>
        <span v-else-if="checkin" class="check">✓</span>
        <span v-else-if="!canCheckin && !editing" class="muted small">{{ evening ? '爸爸妈妈' : '育儿嫂' }}</span>
        <span v-if="notes" class="muted small"><van-icon name="chat-o" /> {{ notes }}</span>
      </div>
    </div>

    <div v-if="editing" class="edit-bar">
      <button v-if="task.sourceId && !checkin" type="button" class="link" @click="$emit('swap')"><van-icon name="replay" /> 换一个</button>
      <button type="button" class="link" @click="$emit('edit')"><van-icon name="edit" /> 编辑</button>
      <button type="button" class="link danger" @click="$emit('remove')"><van-icon name="delete-o" /> 删除</button>
    </div>

    <div v-if="expanded" class="body">
      <p v-if="task.desc" class="goal">{{ task.desc }}</p>
      <div v-if="detail.materials.length" class="materials">
        <span class="muted">准备：</span>
        <span v-for="m in detail.materials" :key="m" class="pill">{{ m }}</span>
      </div>
      <ol v-if="task.steps.length" class="steps">
        <li v-for="(s, i) in task.steps" :key="i">{{ s }}</li>
      </ol>
      <p v-if="detail.hint" class="hint">{{ detail.hint }}</p>

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
.checkin-button { display: grid; place-items: center; width: 52px; height: 44px; border: 0; background: transparent; padding: 0; cursor: pointer; }
.checkin-button span { display: grid; place-items: center; width: 48px; height: 28px; border-radius: 15px; background: var(--bc-surface-2); font-size: 12px; }

.task { padding: 12px 16px; background: var(--bc-surface); scroll-margin-top: 24px; }
.head { display: flex; align-items: center; gap: 12px; }
.task-toggle { padding: 4px 0; min-height: 48px; border: 0; background: transparent; text-align: left; cursor: pointer; }
.title { font-size: 15px; font-weight: 500; line-height: 1.5; overflow-wrap: anywhere; }
.tags { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 5px; font-size: 12px; color: var(--bc-text-3); }
.tags > span + span::before { content: '·'; margin-right: 8px; }
.task--done .title { color: var(--bc-text-2); }
.done-line { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 5px; }
.rating { font-size: 12px; color: var(--bc-accent); }
.side { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; flex: none; }
.check { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 50%; background: var(--bc-accent-soft); color: var(--bc-accent); }
.small { font-size: 12px; }
.edit-bar { display: flex; gap: 20px; border-top: 1px solid var(--bc-border); margin-top: 8px; }
.edit-bar .link { font-size: 13px; }
.danger { color: var(--bc-danger); }
.body { padding-top: 12px; margin-top: 12px; border-top: 1px solid var(--bc-border); font-size: 13px; }
.goal, .hint { margin: 0 0 12px; color: var(--bc-text-2); line-height: 1.7; }
.hint { padding: 10px 12px; border-radius: 8px; background: var(--bc-surface-2); }
.materials { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-bottom: 12px; }
.steps { margin: 0 0 12px; padding-left: 20px; line-height: 1.8; }
.checkin { padding: 12px; border-radius: 8px; background: var(--bc-accent-soft); }
.tag-row { display: flex; flex-wrap: wrap; gap: 6px; }
.ck-note { margin: 6px 0 0; white-space: pre-wrap; }
</style>
