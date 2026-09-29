<!-- ==========================================================================
  备注串：家长 / 育儿嫂对某条日志、任务、汇报的补充说明
  —— 所有成员都能补充；只能删除自己写的（育儿嫂可删除任意备注）
=========================================================================== -->
<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Note, NoteTarget } from '@/shared/types'
import { can } from '@/shared/policy'
import { db } from '@/db/client'
import { useLive } from '@/db/live'
import { useSession } from '@/stores/session'
import { useAction } from '@/composables/useAction'
import { addNote, removeNote } from '@/services/logs'
import { ago } from '@/utils/time'
import AuthorTag from './AuthorTag.vue'

const props = withDefaults(defineProps<{ targetType: NoteTarget; targetId: string; date: string; placeholder?: string }>(), {
  placeholder: '补充备注，全家都能看到…',
})

const session = useSession()
const { busy, run } = useAction()
const draft = ref('')

const notes = useLive(
  async () =>
    (await db().notes.where('[targetType+targetId]').equals([props.targetType, props.targetId]).toArray()).sort(
      (a, b) => a.createdAt - b.createdAt,
    ),
  [] as Note[],
  [() => props.targetId],
)

const canDelete = (n: Note) => !!session.actor && can.deleteNote(session.actor, n)
const empty = computed(() => !draft.value.trim())

async function submit() {
  if (empty.value || !session.baby) {
    return
  }
  const ok = await run(() => addNote(session.baby!.id, props.targetType, props.targetId, props.date, draft.value))
  if (ok) {
    draft.value = ''
  }
}
</script>

<template>
  <div class="thread">
    <div v-for="n in notes" :key="n.id" class="note">
      <div class="row row--between">
        <AuthorTag :user-id="n.createdBy" />
        <span class="row">
          <span class="muted time">{{ ago(n.createdAt) }}</span>
          <button v-if="canDelete(n)" class="link del" type="button" @click="run(() => removeNote(n))">删除</button>
        </span>
      </div>
      <div class="content">{{ n.content }}</div>
    </div>
    <div class="composer">
      <input v-model="draft" class="input" :placeholder="placeholder" maxlength="200" enterkeyhint="send" @keyup.enter="submit" />
      <van-button size="small" type="primary" round :disabled="empty" :loading="busy" @click="submit">发送</van-button>
    </div>
  </div>
</template>

<style scoped>
.thread {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.note {
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--bc-radius-sm);
  background: var(--bc-surface-2);
}

.content {
  margin-top: 2px;
  white-space: pre-wrap;
  word-break: break-all;
}

.time,
.del {
  font-size: 12px;
}

.composer {
  display: flex;
  gap: var(--sp-2);
  align-items: center;
}

.input {
  flex: 1;
  min-width: 0;
  height: 36px;
  padding: 0 var(--sp-3);
  border: 1px solid var(--bc-border);
  border-radius: 999px;
  background: var(--bc-surface);
  outline: none;
}

.input:focus {
  border-color: var(--bc-primary);
}
</style>
