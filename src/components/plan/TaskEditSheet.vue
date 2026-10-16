<!-- =======================================================================
  计划任务编辑：复用任务表单，持久化操作仍由计划服务统一处理。
======================================================================= -->
<script setup lang="ts">
import type { Baby, DateKey, PlanTask, Slot, TaskKind } from '@/shared/types'
import { useAction } from '@/composables/useAction'
import { addCustomTask, updateTask, type TaskInput } from '@/services/plan'
import TaskFormSheet from './TaskFormSheet.vue'

const props = defineProps<{ task: PlanTask | null; baby: Baby; date: DateKey; defaults?: { kind: TaskKind; slot: Slot } }>()
const show = defineModel<boolean>('show', { required: true })
const { busy, run } = useAction()

async function save(input: TaskInput) {
  const saved = await run(() => props.task ? updateTask(props.task, input) : addCustomTask(props.baby, props.date, input), '已保存')
  if (saved) show.value = false
}
</script>

<template>
  <TaskFormSheet v-model:show="show" :task="task" :lock-kind="!!task" :defaults="defaults" :saving="busy" @save="save" />
</template>
