<!-- ==========================================================================
  日模板库：喂养与早教分开编辑、应用，同一天可组合使用两类模板。
  ----------------------------------------------------------------------------
  ?edit=new|<id> 打开编辑；from=current 可用当天计划起稿。
=========================================================================== -->
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router'
import { showConfirmDialog, showFailToast } from 'vant'
import { EDU_CATEGORIES, FEED_KIND_META, TEMPLATE_KIND_LABEL } from '@/shared/constants'
import type { EduCategory, FeedKind, PlanTemplate, Slot, TemplateKind, TemplateTask } from '@/shared/types'
import { normalizeTemplateTasks, type TaskInput } from '@/domain/plan-task'
import { useSession } from '@/stores/session'
import { useClock } from '@/composables/useClock'
import { useAction } from '@/composables/useAction'
import { useLive } from '@/db/live'
import { db } from '@/db/client'
import { applyDailyTemplate, isRecipe, removeDailyTemplate, saveDailyTemplate, type LibraryPick } from '@/services/plan'
import { ageOf, dateKey, dayjs, shiftDate } from '@/utils/time'
import PageNav from '@/components/PageNav.vue'
import ChipGroup from '@/components/ChipGroup.vue'
import AppIcon from '@/components/AppIcon.vue'
import IconBadge from '@/components/IconBadge.vue'
import AppSheet from '@/components/AppSheet.vue'
import ActionMenu from '@/components/ActionMenu.vue'
import TaskFormSheet from '@/components/plan/TaskFormSheet.vue'
import TemplateMaterialPicker from '@/components/plan/TemplateMaterialPicker.vue'

const route = useRoute()
const router = useRouter()
const session = useSession()
const { today } = useClock()
const { busy, run } = useAction()
const baby = computed(() => session.baby)
const babyId = computed(() => baby.value?.id ?? '')
const referenceDate = computed(() => {
  const value = route.query.date
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && dayjs(value).format('YYYY-MM-DD') === value ? value : today.value
})
const age = computed(() => ageOf(baby.value?.birthday ?? today.value, referenceDate.value))
const templates = useLive(async () => (await db().dailyTemplates.where('babyId').equals(babyId.value).toArray())
  .filter((template) => !template.deleted).sort((a, b) => b.updatedAt - a.updatedAt || a.name.localeCompare(b.name, 'zh-CN', { numeric: true })), [] as PlanTemplate[], [babyId])
const templateKind = computed<TemplateKind>({
  get: () => route.query.kind === 'edu' ? 'edu' : 'feeding',
  set: (kind) => { void router.replace({ query: { ...route.query, kind } }) },
})
const templateOptions = [
  { value: 'feeding' as const, label: '喂养模板', symbol: 'milk' },
  { value: 'edu' as const, label: '早教模板', symbol: 'gross' },
]
const allowedKinds = computed(() => templateKind.value === 'feeding' ? ['feeding'] as const : ['edu', 'interaction'] as const)
const search = ref('')
const filteredTemplates = computed(() => templates.value.filter((template) => template.kind === templateKind.value && template.name.includes(search.value.trim())))
const expandedTemplate = ref('')
const previewTemplate = computed(() => templates.value.find((template) => template.id === expandedTemplate.value))
const previewShow = computed({ get: () => !!previewTemplate.value, set: (show: boolean) => { if (!show) expandedTemplate.value = '' } })
const templateActions = [
  { text: '编辑模板', value: 'edit', icon: 'edit' }, { text: '复制模板', value: 'copy', icon: 'copy' },
  { text: '删除模板', value: 'delete', icon: 'delete', danger: true },
]
const draftActions = (index: number) => [
  { text: '上移', value: 'up', icon: 'up', disabled: index === 0 },
  { text: '下移', value: 'down', icon: 'down', disabled: index === tasks.value.length - 1 },
  { text: '删除任务', value: 'delete', icon: 'delete', danger: true },
]
const editing = computed(() => typeof route.query.edit === 'string')
const templateId = ref<string>()
const name = ref('')
const tasks = ref<TemplateTask[]>([])
const loading = ref(false)
const savedContent = ref('')
const content = computed(() => JSON.stringify({ name: name.value, tasks: tasks.value }))
const dirty = computed(() => editing.value && !loading.value && content.value !== savedContent.value)
const taskShow = ref(false)
const taskIndex = ref<number | null>(null)
const taskInput = ref<TaskInput | null>(null)
const pickerShow = ref(false)
const calendarShow = ref(false)
const selectedTemplate = ref<Pick<PlanTemplate, 'babyId' | 'kind' | 'name' | 'tasks'> | null>(null)
const selectedDates = ref<Date[]>([])
const appliedDates = ref<string[]>([])
watch(templateKind, () => { search.value = ''; appliedDates.value = [] })

const kindLabels = { feeding: '喂养', edu: '早教', interaction: '亲子互动' }
const cloneTasks = (items: readonly TemplateTask[]) => items.map((task) => ({ ...task, steps: [...task.steps] }))
const summary = (items: readonly TemplateTask[]) => (['feeding', 'edu', 'interaction'] as const)
  .filter((kind) => items.some((task) => task.kind === kind))
  .map((kind) => `${kindLabels[kind]} ${items.filter((task) => task.kind === kind).length}`).join(' · ')
const categoryLabel = (task: TemplateTask) => task.kind === 'feeding'
  ? FEED_KIND_META[task.category as FeedKind]?.label : EDU_CATEGORIES[task.category as EduCategory]?.label

/* ----------------------------------------------------------------------------
 * 路由控制草稿：编辑中只改内存；保存成功后才写入模板库。
 * -------------------------------------------------------------------------- */
let loadSequence = 0
watch([babyId, () => route.query.edit, () => route.query.from, () => route.query.copy, templateKind], async () => {
  const sequence = ++loadSequence
  if (!editing.value || !baby.value) return
  loading.value = true
  templateId.value = undefined
  name.value = ''
  tasks.value = []
  try {
    const id = route.query.edit === 'new' ? route.query.copy : route.query.edit
    if (typeof id === 'string') {
      const stored = await db().dailyTemplates.get(id)
      if (sequence !== loadSequence) return
      if (!stored || stored.deleted || stored.babyId !== babyId.value || stored.kind !== templateKind.value) throw new Error('当前分类中不存在这份模板')
      templateId.value = route.query.edit === 'new' ? undefined : stored.id
      name.value = `${stored.name}${templateId.value ? '' : ' 副本'}`
      tasks.value = cloneTasks(stored.tasks)
    } else if (route.query.from === 'current') {
      const current = await db().tasks.where('[babyId+date]').equals([babyId.value, referenceDate.value]).toArray()
      if (sequence !== loadSequence) return
      name.value = `${dayjs(referenceDate.value).format('M月D日')}${templateKind.value === 'feeding' ? '喂养安排' : '早教安排'}`
      const scoped = current.filter((task) => (task.kind === 'feeding') === (templateKind.value === 'feeding'))
      tasks.value = scoped.length ? normalizeTemplateTasks(scoped.sort((a, b) => a.order - b.order), templateKind.value) : []
    }
    savedContent.value = content.value
  } catch (error) {
    showFailToast(error instanceof Error ? error.message : '日模板加载失败')
    savedContent.value = content.value
    await router.replace({ path: '/plan/templates', query: { date: referenceDate.value, kind: templateKind.value } })
  } finally {
    if (sequence === loadSequence) loading.value = false
  }
}, { immediate: true })

const confirmLeave = () => !dirty.value || showConfirmDialog({ title: '离开编辑', message: '日模板还有未保存的修改，确定离开吗？', confirmButtonText: '放弃修改' }).then(() => true).catch(() => false)
onBeforeRouteLeave(confirmLeave)
onBeforeRouteUpdate(confirmLeave)

function openEditor(id = 'new', from?: string, copy?: string) {
  void router.push({ path: '/plan/templates', query: { date: referenceDate.value, kind: templateKind.value, edit: id, from, copy } })
}

function editTask(index: number | null) {
  taskIndex.value = index
  taskInput.value = index === null ? null : { ...tasks.value[index], steps: [...tasks.value[index].steps] }
  taskShow.value = true
}

function saveTask(input: TaskInput) {
  const index = taskIndex.value
  const previous = index === null ? null : tasks.value[index]
  const entry: TemplateTask = {
    ...input, sourceId: previous?.kind === input.kind && previous.category === input.category ? previous.sourceId : null,
    order: index === null ? tasks.value.length + 1 : index + 1,
  }
  if (index === null) tasks.value.push(entry)
  else tasks.value.splice(index, 1, entry)
  taskShow.value = false
}

function moveTask(index: number, offset: number) {
  const target = index + offset
  if (target < 0 || target >= tasks.value.length) return
  const [task] = tasks.value.splice(index, 1)
  tasks.value.splice(target, 0, task)
  tasks.value.forEach((entry, i) => { entry.order = i + 1 })
}

function pickMaterial(item: LibraryPick, slot: Slot) {
  const recipe = isRecipe(item)
  tasks.value.push({
    kind: recipe ? 'feeding' : 'slot' in item ? 'interaction' : 'edu',
    category: recipe ? 'solid' : item.category, slot: recipe ? 'day' : slot,
    title: recipe ? item.name : item.title, desc: recipe ? item.tip : item.goal,
    steps: [...item.steps], sourceId: item.id, time: recipe ? '12:00' : null, amount: null, order: tasks.value.length + 1,
  })
}

async function save() {
  if (!baby.value) return
  const saved = await run(() => saveDailyTemplate(baby.value!, { kind: templateKind.value, name: name.value, tasks: tasks.value }, templateId.value), '日模板已保存')
  if (saved) {
    savedContent.value = content.value
    await router.replace({ path: '/plan/templates', query: { date: referenceDate.value, kind: templateKind.value } })
  }
}

async function drop(template: PlanTemplate) {
  if (!baby.value) return
  const confirmed = await showConfirmDialog({
    title: '删除日模板', message: `确定删除「${template.name}」吗？已应用到日期中的计划会保留。`,
  }).then(() => true).catch(() => false)
  if (!confirmed) return
  await run(() => removeDailyTemplate(baby.value!, template.id), '日模板已删除')
}

function selectTemplateAction(template: PlanTemplate, action: { value: string }) {
  if (action.value === 'edit') openEditor(template.id)
  else if (action.value === 'copy') openEditor('new', undefined, template.id)
  else if (action.value === 'delete') void drop(template)
}

function selectDraftAction(index: number, action: { value: string }) {
  if (action.value === 'delete') tasks.value.splice(index, 1)
  else moveTask(index, action.value === 'up' ? -1 : 1)
}

/* ----------------------------------------------------------------------------
 * 应用快照：先多选具体日期，再确认替换未完成安排；不用星期推导目标日期。
 * -------------------------------------------------------------------------- */
function openApply(template: Pick<PlanTemplate, 'babyId' | 'kind' | 'name' | 'tasks'>) {
  selectedTemplate.value = { ...template, tasks: cloneTasks(template.tasks) }
  selectedDates.value = [dayjs(referenceDate.value < today.value ? today.value : referenceDate.value).toDate()]
  calendarShow.value = true
}

async function apply(value: Date | Date[]) {
  const dates = (Array.isArray(value) ? value : [value]).map((date) => dateKey(date)).sort()
  const template = selectedTemplate.value
  if (!baby.value || !template || !dates.length || busy.value) return
  selectedDates.value = dates.map((date) => dayjs(date).toDate())
  const dateText = dates.slice(0, 6).map((date) => dayjs(date).format('M月D日')).join('、')
  const confirmed = await showConfirmDialog({
    title: `将「${template.name}」应用到 ${dates.length} 天`,
    message: `${dateText}${dates.length > 6 ? '等日期' : ''}\n\n${template.kind === 'feeding' ? '仅替换未完成的喂养安排，早教与亲子不变。' : '仅替换未完成的早教与亲子安排，喂养不变。'}已完成任务与护理记录保留。`,
    confirmButtonText: '确认应用',
  }).then(() => true).catch(() => false)
  if (!confirmed) return
  const result = await run(() => applyDailyTemplate(baby.value!, dates, template), `已应用到 ${dates.length} 天`)
  if (result) { calendarShow.value = false; appliedDates.value = dates }
}
</script>

<template>
  <div class="page templates-page" :class="{ 'templates-page--editing': editing }">
    <PageNav :title="editing ? `${templateId ? '编辑' : '新建'}${TEMPLATE_KIND_LABEL[templateKind]}` : '我的模板'">
      <template #right>
        <button v-if="!editing" type="button" class="nav-action" @click="openEditor()"><AppIcon name="plus" :size="19" />新建</button>
        <button v-else type="button" class="nav-action nav-action--primary" :disabled="!name.trim() || !tasks.length || busy || loading" @click="save"><van-loading v-if="busy" size="16" /><span v-else>保存</span></button>
      </template>
    </PageNav>
    <main v-if="!editing" class="template-body page-body">
      <ChipGroup v-model="templateKind" :options="templateOptions" segmented class="template-kind-tabs" />
      <section v-if="appliedDates.length" class="applied-card">
        <strong><AppIcon name="check" :size="16" /> 已安排 {{ appliedDates.length }} 天</strong>
        <div class="date-links"><router-link v-for="date in appliedDates" :key="date" :to="{ path: '/plan', query: { date } }">{{ dayjs(date).format('M月D日') }} <AppIcon name="right" :size="12" /></router-link></div>
      </section>
      <van-search v-if="templates.some((template) => template.kind === templateKind)" v-model="search" :placeholder="`搜索${TEMPLATE_KIND_LABEL[templateKind]}`" background="transparent" />
      <div v-if="filteredTemplates.length" class="library-caption">{{ filteredTemplates.length }} 个{{ TEMPLATE_KIND_LABEL[templateKind] }}</div>
      <section v-if="filteredTemplates.length" class="template-list" aria-label="日模板">
        <article v-for="template in filteredTemplates" :key="template.id" class="template-entry">
          <div class="template-row">
            <button class="template-main" type="button" :aria-label="`查看${template.name}`" @click="expandedTemplate = template.id">
              <IconBadge class="template-icon" :name="template.kind === 'feeding' ? 'milk' : 'gross'" :tone="template.kind" />
              <span class="grow"><h2>{{ template.name }}</h2><span class="template-summary">{{ summary(template.tasks) }}</span></span>
            </button>
            <button type="button" class="apply-button" :disabled="busy" :aria-label="`应用${template.name}`" @click="openApply(template)"><span>应用</span></button>
            <ActionMenu :label="`${template.name}的更多操作`" :actions="templateActions" :disabled="busy" @select="(action) => selectTemplateAction(template, action)" />
          </div>
        </article>
      </section>
      <van-empty v-if="!filteredTemplates.length" image-size="64" :description="search ? '没有匹配的模板' : '还没有日模板'">
        <van-button v-if="!search" size="small" type="primary" round @click="openEditor()">新建模板</van-button>
      </van-empty>
    </main>
    <main v-else class="page-body editor-body">
      <van-loading v-if="loading" class="loading" vertical>正在读取模板</van-loading>
      <template v-else>
        <section class="editor-name"><label for="template-name">模板名称</label><van-field id="template-name" v-model="name" maxlength="40" placeholder="给这一天起个名字" class="name-field" clearable /></section>
        <div class="draft-caption"><strong>日程</strong><span>{{ tasks.length }} 项</span></div>
        <section v-if="tasks.length" class="draft-list">
          <article v-for="(task, index) in tasks" :key="index" class="draft-task">
            <button type="button" class="draft-main" :aria-label="`编辑${task.title}`" @click="editTask(index)">
              <span class="draft-time"><time>{{ task.time || (task.slot === 'evening' ? '晚间' : '日间') }}</time><AppIcon :name="task.category" :size="16" /></span>
              <span class="grow"><strong>{{ task.title }} <small v-if="task.amount !== null">{{ task.amount }}ml</small></strong><span class="task-meta">{{ categoryLabel(task) }}<template v-if="task.kind !== 'feeding'"> · {{ task.slot === 'evening' ? '晚间' : '日间' }}</template></span></span>
            </button>
            <ActionMenu :label="`${task.title}的更多操作`" :actions="draftActions(index)" @select="(action) => selectDraftAction(index, action)" />
          </article>
        </section>
        <van-empty v-if="!tasks.length" image-size="64" description="从素材库选择，或添加自定义任务" />
        <div class="editor-dock"><button type="button" @click="pickerShow = true"><AppIcon name="library" :size="18" />素材库</button><span /><button type="button" @click="editTask(null)"><AppIcon name="plus" :size="18" />自定义任务</button></div>
      </template>
    </main>
    <AppSheet v-model:show="previewShow" :title="previewTemplate?.name ?? '模板日程'" tall>
      <template v-if="previewTemplate">
        <div class="preview-caption">{{ summary(previewTemplate.tasks) }}</div>
        <div v-for="(task, index) in previewTemplate.tasks" :key="index" class="preview-task">
          <time>{{ task.time || (task.slot === 'evening' ? '晚间' : '日间') }}</time>
          <span class="grow"><strong>{{ task.title }}</strong><small v-if="task.desc">{{ task.desc }}</small></span><span v-if="task.amount !== null" class="preview-amount">{{ task.amount }}ml</span>
        </div>
      </template>
      <template #footer><div v-if="previewTemplate" class="preview-actions"><van-button @click="openEditor(previewTemplate.id); previewShow = false">编辑模板</van-button><van-button type="primary" @click="openApply(previewTemplate!); previewShow = false">应用到日期</van-button></div></template>
    </AppSheet>
    <TaskFormSheet v-model:show="taskShow" :task="taskInput" :allowed-kinds="allowedKinds" :defaults="{ kind: templateKind, slot: 'day' }" :title="taskIndex === null ? '添加任务' : '编辑任务'" @save="saveTask" />
    <TemplateMaterialPicker v-model:show="pickerShow" :kind="templateKind" :months="age.monthsFloat" :added-ids="tasks.flatMap((task) => task.sourceId ? [task.sourceId] : [])" @pick="pickMaterial" />
    <van-calendar v-model:show="calendarShow" type="multiple" switch-mode="year-month" title="选择应用日期" :default-date="selectedDates" :min-date="dayjs(today).toDate()" :max-date="dayjs(shiftDate(today, 365)).toDate()" first-day-of-week="1" confirm-text="应用到所选日期" teleport="body" @confirm="apply" />
  </div>
</template>

<style scoped>
.templates-page { background: var(--bc-surface); }
.template-body { padding-top: 16px; }
.template-kind-tabs { margin-bottom: 8px; }
.template-body :deep(.van-search) { padding-bottom: 12px; }
.library-caption { font-size: 12px; color: var(--bc-text-3); padding: 4px 0 8px; }
.template-list { margin-inline: -20px; }
.template-entry { position: relative; }
.template-entry + .template-entry::before { content: ''; position: absolute; left: 72px; right: 20px; height: 1px; background: var(--bc-border); }
.template-row { display: flex; align-items: center; padding: 0 8px 0 20px; gap: 0; }
.template-main { display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0; min-height: 76px; padding: 12px 0; border: 0; background: transparent; text-align: left; cursor: pointer; }
.template-icon { width: 36px; height: 40px; border-radius: 10px; }
.template-main h2 { margin: 0 0 5px; font-size: 15px; line-height: 1.4; font-weight: 500; overflow-wrap: anywhere; }
.template-summary { display: block; font-size: 11px; color: var(--bc-text-3); line-height: 1.5; }
.apply-button { flex: none; display: grid; place-items: center; width: 54px; height: 44px; padding: 0; border: 0; background: transparent; cursor: pointer; }
.apply-button span { display: grid; place-items: center; min-width: 48px; height: 28px; padding: 0 9px; border-radius: 15px; background: var(--bc-surface-2); color: var(--bc-text); font-size: 12px; font-weight: 500; }
.template-row :deep(.icon-button) { color: var(--bc-text-3); }
.editor-body { padding-top: 20px; padding-bottom: calc(88px + env(safe-area-inset-bottom)); }
.editor-name { margin-bottom: 28px; }
.editor-name label { font-size: 12px; color: var(--bc-text-3); }
.name-field { padding: 8px 0 12px; border-bottom: 1px solid var(--bc-border); font-size: 19px; background: transparent; }
.name-field::after { display: none; }
.draft-caption { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.draft-caption strong { font-size: 15px; font-weight: 600; }
.draft-caption span { font-size: 12px; color: var(--bc-text-3); }
.draft-task { display: flex; align-items: center; gap: 4px; position: relative; }
.draft-task + .draft-task { border-top: 1px solid var(--bc-border); }
.draft-main { display: flex; align-items: center; gap: 16px; flex: 1; min-width: 0; min-height: 76px; padding: 12px 0; border: 0; background: transparent; text-align: left; cursor: pointer; }
.draft-time { display: flex; align-items: center; flex-direction: column; gap: 5px; flex: none; width: 40px; color: var(--bc-text-3); font-size: 12px; font-variant-numeric: tabular-nums; }
.draft-time time { color: var(--bc-text-2); }
.draft-main strong { display: block; font-size: 14px; font-weight: 500; overflow-wrap: anywhere; }
.draft-main small { font-size: 12px; font-weight: 400; color: var(--bc-text-3); }
.task-meta { display: block; margin-top: 5px; font-size: 11px; color: var(--bc-text-3); }
.editor-dock { display: flex; align-items: center; position: fixed; z-index: 10; bottom: 0; left: 0; right: 0; margin-inline: auto; width: min(100%, var(--bc-max-w)); padding: 8px 16px calc(8px + env(safe-area-inset-bottom)); border-top: 1px solid var(--bc-border); background: var(--bc-surface); }
.editor-dock button { display: flex; align-items: center; justify-content: center; gap: 8px; flex: 1; height: 44px; border: 0; background: transparent; font-size: 14px; cursor: pointer; }
.editor-dock > span { width: 1px; height: 18px; background: var(--bc-border); }
.loading { padding: 60px 0; }
.applied-card { padding: 12px 16px; margin: 4px 0 8px; font-size: 13px; color: var(--bc-accent); background: var(--bc-accent-soft); border-radius: 10px; }
.applied-card strong { display: flex; align-items: center; gap: 6px; font-weight: 500; }
.date-links { display: flex; flex-wrap: wrap; gap: 0 12px; }
.date-links a { color: var(--bc-accent); text-decoration: none; min-height: 44px; display: inline-flex; align-items: center; gap: 4px; }
.preview-caption { font-size: 12px; color: var(--bc-text-3); margin-bottom: 12px; }
.preview-task { display: flex; align-items: baseline; gap: 16px; padding: 16px 0; border-bottom: 1px solid var(--bc-border); font-size: 14px; }
.preview-task time { width: 36px; flex: none; color: var(--bc-text-3); font-size: 12px; font-variant-numeric: tabular-nums; }
.preview-task strong { font-weight: 500; }
.preview-task small { display: block; margin-top: 5px; color: var(--bc-text-2); font-size: 12px; line-height: 1.7; }
.preview-amount { color: var(--bc-text-2); font-size: 12px; white-space: nowrap; }
.preview-actions { display: flex; gap: 12px; }
.preview-actions > * { flex: 1; }
@media (max-width: 390px) { .template-list { margin-inline: -16px; } .template-row { padding-left: 16px; padding-right: 4px; } .template-main { gap: 10px; } .template-icon { width: 32px; height: 38px; } .template-entry + .template-entry::before { left: 58px; right: 16px; } }
</style>
