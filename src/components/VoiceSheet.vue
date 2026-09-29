<!-- ==========================================================================
  语音录入：说一句话 → 规则解析成多条草稿 → 逐条确认/删除 → 一键保存
  ----------------------------------------------------------------------------
  浏览器不支持语音识别时（如微信内置浏览器）退化为文本框，
  可直接使用输入法自带的语音输入，解析流程完全一致。
=========================================================================== -->
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { LOG_KINDS } from '@/shared/constants'
import type { CareLog } from '@/shared/types'
import { summarizeLog } from '@/domain/log-kinds'
import { parseVoice, type VoiceDraft } from '@/domain/voice-parser'
import { FOOD_NAMES } from '@/library'
import { useSession } from '@/stores/session'
import { useAction } from '@/composables/useAction'
import { useVoice } from '@/composables/useVoice'
import { addLog } from '@/services/logs'
import { dateKey, dateLabel, hm } from '@/utils/time'

const show = defineModel<boolean>('show', { required: true })
const session = useSession()
const voice = useVoice()
const { busy, run } = useAction()

const drafts = ref<VoiceDraft[]>([])
const parsed = ref(false)

const EXAMPLES = ['刚喝了150毫升奶粉', '两点到三点半睡了一觉，睡得很安稳', '拉了一次黄色软便', '中午吃了南瓜泥半碗很爱吃', '耳温37度5']

watch(show, (v) => {
  if (v) {
    voice.text.value = ''
    drafts.value = []
    parsed.value = false
  } else {
    voice.stop()
  }
})

watch(voice.listening, (on, was) => {
  if (was && !on && voice.text.value.trim()) {
    parse()
  }
})

function parse() {
  drafts.value = parseVoice(voice.text.value, { foods: FOOD_NAMES })
  parsed.value = true
}

// 草稿借用日志摘要函数展示
const asLog = (d: VoiceDraft) => ({ ...d, id: '', seq: 1 }) as unknown as CareLog
const preview = computed(() => drafts.value.map((d) => ({ d, text: summarizeLog(asLog(d)) })))

async function saveAll() {
  const babyId = session.baby?.id
  if (!babyId || !drafts.value.length) {
    return
  }
  const n = drafts.value.length
  const ok = await run(async () => {
    for (const d of drafts.value) {
      await addLog(babyId, { type: d.type, time: d.time, endTime: d.endTime, data: d.data, note: d.note === d.raw ? '' : d.note, source: 'voice' })
    }
    return true
  }, `已保存 ${n} 条记录`)
  if (ok) {
    show.value = false
  }
}
</script>

<template>
  <van-popup v-model:show="show" position="bottom" round closeable teleport="body" :style="{ maxWidth: 'var(--bc-max-w)', left: '50%', transform: 'translateX(-50%)' }">
    <div class="sheet">
      <div class="sheet-head"><div class="sheet-title">🎙 语音记录</div></div>

      <textarea
        v-model="voice.text.value"
        class="textarea"
        rows="3"
        maxlength="300"
        :placeholder="voice.supported ? '点下方按钮开始说话，也可以直接输入' : '当前浏览器不支持语音识别，可用输入法的语音输入（键盘上的🎙）'"
      />
      <div v-if="voice.error.value" class="pill pill--danger err">{{ voice.error.value }}</div>

      <div class="mic-row">
        <button
          v-if="voice.supported"
          type="button"
          class="mic"
          :class="{ 'mic--on': voice.listening.value }"
          :aria-label="voice.listening.value ? '停止' : '开始说话'"
          @click="voice.listening.value ? voice.stop() : voice.start()"
        >
          <van-icon :name="voice.listening.value ? 'pause' : 'volume-o'" size="28" />
        </button>
        <van-button round plain type="primary" :disabled="!voice.text.value.trim()" @click="parse">识别文字</van-button>
      </div>
      <p v-if="voice.listening.value" class="muted center">正在听…说完点一下停止</p>

      <template v-if="!parsed">
        <div class="form-label">可以这样说</div>
        <div class="examples">
          <button v-for="e in EXAMPLES" :key="e" type="button" class="pill ex" @click="voice.text.value = e; parse()">“{{ e }}”</button>
        </div>
      </template>

      <template v-else>
        <div class="form-label">识别结果（{{ drafts.length }} 条，点 × 移除）</div>
        <van-empty v-if="!drafts.length" image-size="64" description="没听懂，换个说法试试，比如「三点喝了120毫升奶」" />
        <div v-for="(p, i) in preview" :key="i" class="draft">
          <span class="d-icon">{{ LOG_KINDS[p.d.type].icon }}</span>
          <div class="grow">
            <div><strong>{{ LOG_KINDS[p.d.type].label }}</strong> {{ p.text }}</div>
            <div class="muted">{{ dateKey(p.d.time) === dateKey() ? '' : dateLabel(dateKey(p.d.time)) }} {{ hm(p.d.time) }}</div>
          </div>
          <van-icon name="cross" class="rm" @click="drafts.splice(i, 1)" />
        </div>
        <div class="sheet-actions">
          <van-button round block type="primary" :disabled="!drafts.length" :loading="busy" @click="saveAll">全部保存</van-button>
        </div>
      </template>
    </div>
  </van-popup>
</template>

<style scoped>
.err {
  margin-top: var(--sp-2);
}

.mic-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--sp-4);
  margin: var(--sp-4) 0 var(--sp-2);
}

.mic {
  display: grid;
  place-items: center;
  width: 68px;
  height: 68px;
  border: 0;
  border-radius: 50%;
  background: var(--bc-primary);
  color: #fff;
  box-shadow: var(--bc-shadow-lg);
  cursor: pointer;
}

.mic--on {
  animation: pulse 1.2s ease infinite;
}

@keyframes pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(255, 126, 103, 0.5);
  }
  100% {
    box-shadow: 0 0 0 18px rgba(255, 126, 103, 0);
  }
}

.center {
  text-align: center;
  margin: 0;
}

.examples {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
}

.ex {
  border: 0;
  cursor: pointer;
  padding: 6px 10px;
}

.draft {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-3);
  margin-bottom: var(--sp-2);
  border-radius: var(--bc-radius-sm);
  background: var(--bc-surface-2);
}

.d-icon {
  font-size: 22px;
}

.rm {
  padding: 6px;
  color: var(--bc-text-3);
  cursor: pointer;
}
</style>
