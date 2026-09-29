<!-- ==========================================================================
  汇报分块卡片：展示 / 就地编辑（育儿嫂）
  ----------------------------------------------------------------------------
  手动改写过的块标记"已手动修改"，刷新数据时不会被系统覆盖；
  "恢复自动"丢弃改写，重新使用系统汇总的内容。
=========================================================================== -->
<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import type { ReportBlock } from '@/shared/types'

const props = defineProps<{ block: ReportBlock; editable: boolean; editing: boolean }>()
const emit = defineEmits<{ edit: []; done: []; restore: []; input: [text: string] }>()

const area = ref<HTMLTextAreaElement | null>(null)

watch(
  () => props.editing,
  async (on) => {
    if (on) {
      await nextTick()
      area.value?.focus()
    }
  },
)
</script>

<template>
  <section class="card block" :class="{ 'block--editing': editing }">
    <header class="block-head">
      <span class="icon">{{ block.icon }}</span>
      <span class="title">{{ block.title }}</span>
      <span v-if="block.edited" class="pill pill--warn">已手动修改</span>
      <span class="grow" />
      <template v-if="editable">
        <button v-if="!editing" class="link" type="button" @click="emit('edit')">编辑</button>
        <template v-else>
          <button v-if="block.edited" class="link restore" type="button" @click="emit('restore')">恢复自动</button>
          <button class="link" type="button" @click="emit('done')">完成</button>
        </template>
      </template>
    </header>
    <textarea
      v-if="editing"
      ref="area"
      class="textarea"
      rows="4"
      :value="block.text"
      placeholder="写点什么…留空则复制时不显示此项"
      @input="emit('input', ($event.target as HTMLTextAreaElement).value)"
    />
    <p v-else-if="block.text.trim()" class="text">{{ block.text }}</p>
    <p v-else class="text muted">（空，复制时不显示）</p>
  </section>
</template>

<style scoped>
.block {
  padding: var(--sp-3) var(--sp-4);
}

.block--editing {
  box-shadow: 0 0 0 2px var(--bc-primary), var(--bc-shadow);
}

.block-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.icon {
  font-size: 18px;
}

.title {
  font-size: 15px;
  font-weight: 600;
}

.restore {
  margin-right: var(--sp-3);
  color: var(--bc-text-2);
}

.text {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.7;
  color: var(--bc-text);
  font-variant-numeric: tabular-nums;
}

.textarea {
  min-height: 96px;
}
</style>
