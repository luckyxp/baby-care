<!-- ==========================================================================
  日志表单弹层：新建 / 编辑 / 只读查看 三合一
  ----------------------------------------------------------------------------
  · 新建：沿用上一次同类记录的习惯值（奶量、奶的类型、测温方式），尽量一点即存
  · 编辑：权限不足时自动退化为只读查看（家长查看育儿嫂的记录），仍可补充备注
  · 预设：计划任务 / 语音解析可预填字段
=========================================================================== -->
<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { showConfirmDialog } from 'vant'
import {
  ACCEPT_LABEL, BREAST_SIDE_LABEL, DIAPER_KIND_LABEL, LOG_KINDS, LOG_TYPES, MEDICINE_PRESETS, MILK_MODE_LABEL,
  SLEEP_QUALITY_LABEL, SOLID_AMOUNTS, STOOL_COLORS, STOOL_TEXTURES, STOOL_VOLUME_LABEL, TEMP_METHOD_LABEL,
} from '@/shared/constants'
import { can } from '@/shared/policy'
import type { CareLog, LogDataMap, LogType } from '@/shared/types'
import { abnormalReason, emptyData, summarizeLog } from '@/domain/log-kinds'
import { foodsFor } from '@/library'
import { db } from '@/db/client'
import { useSession } from '@/stores/session'
import { useAction } from '@/composables/useAction'
import { addLog, editLog, removeLog, type LogInput } from '@/services/logs'
import { ageOf, fmtDuration, hm } from '@/utils/time'
import AuthorTag from './AuthorTag.vue'
import ChipGroup, { type ChipOption } from './ChipGroup.vue'
import NoteThread from './NoteThread.vue'
import TimeField from './TimeField.vue'

const props = defineProps<{
  type?: LogType
  log?: CareLog | null
  preset?: Partial<LogInput> | null
}>()
const show = defineModel<boolean>('show', { required: true })
const emit = defineEmits<{ saved: [log: CareLog] }>()

const session = useSession()
const { busy, run } = useAction()

/* ── 表单状态 ───────────────────────────────────────────────────────────── */

const form = reactive({
  type: 'milk' as LogType,
  time: Date.now(),
  endTime: null as number | null,
  sleeping: false,
  data: emptyData('milk') as LogDataMap[LogType],
  note: '',
})
const customFood = ref('')
const showAllFoods = ref(false)

const editing = computed(() => !!props.log)
const readonly = computed(() => !!props.log && !(session.actor && can.editLog(session.actor, props.log)))
const kind = computed(() => LOG_KINDS[form.type])
const months = computed(() => (session.baby ? ageOf(session.baby.birthday).monthsFloat : 0))

// 模板里按类型取强类型数据
const milk = computed(() => form.data as LogDataMap['milk'])
const solid = computed(() => form.data as LogDataMap['solid'])
const diaper = computed(() => form.data as LogDataMap['diaper'])
const sleep = computed(() => form.data as LogDataMap['sleep'])
const temp = computed(() => form.data as LogDataMap['temp'])
const med = computed(() => form.data as LogDataMap['medicine'])
const growth = computed(() => form.data as LogDataMap['growth'])
const other = computed(() => form.data as LogDataMap['other'])

const num = (v: string | number) => (v === '' || Number.isNaN(Number(v)) ? null : Number(v))
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

async function lastOf(type: LogType): Promise<CareLog | undefined> {
  const id = session.baby?.id
  if (!id) {
    return undefined
  }
  return db().logs.where('[babyId+type+time]').between([id, type, 0], [id, type, Infinity]).last()
}

async function init(override?: LogType) {
  const log = props.log
  if (log) {
    Object.assign(form, { type: log.type, time: log.time, endTime: log.endTime, sleeping: log.type === 'sleep' && log.endTime === null, data: clone(log.data), note: log.note })
    return
  }
  const p = props.preset ?? {}
  const type = override ?? p.type ?? props.type ?? 'milk'
  const data = clone(emptyData(type))
  const last = await lastOf(type)
  if (last && type === 'milk') {
    Object.assign(data, { mode: (last.data as LogDataMap['milk']).mode, amount: (last.data as LogDataMap['milk']).amount ?? 120 })
  }
  if (last && type === 'temp') {
    (data as LogDataMap['temp']).method = (last.data as LogDataMap['temp']).method
  }
  const time = override ? form.time : (p.time ?? Date.now())
  Object.assign(form, {
    type, time,
    endTime: p.endTime ?? null,
    sleeping: type === 'sleep' && (p.endTime ?? null) === null,
    data: { ...data, ...clone(p.data ?? {}) },
    note: p.note ?? '',
  })
  customFood.value = ''
  showAllFoods.value = false
}

watch(show, (v) => {
  if (v) {
    void init()
  }
})

/* ── 选项 ───────────────────────────────────────────────────────────────── */

const opts = <K extends string>(labels: Record<K, string>): ChipOption<K>[] =>
  (Object.keys(labels) as K[]).map((value) => ({ value, label: labels[value] }))

const MILK_AMOUNTS = [60, 90, 120, 150, 180, 210, 240]
const BREAST_MINUTES = [5, 10, 15, 20, 30]
const REACTIONS = ['起疹', '呕吐', '腹泻', '便秘']
const TEMP_QUICK = [36.5, 36.8, 37.0, 37.3, 37.5, 38.0, 38.5]

const foodOptions = computed<ChipOption<string>[]>(() => {
  const list = foodsFor(Math.max(6, months.value))
  const picked = solid.value.foods ?? []
  const base = showAllFoods.value ? list : list.slice(0, 16)
  const names = new Set(base.map((f) => f.name))
  const extra = picked.filter((f) => !names.has(f)).map((f) => ({ value: f, label: f }))
  return [...extra, ...base.map((f) => ({ value: f.name, label: f.name, hint: f.allergen ? '敏' : undefined }))]
})

function addCustomFood() {
  const name = customFood.value.trim()
  if (name && !solid.value.foods.includes(name)) {
    solid.value.foods.push(name)
  }
  customFood.value = ''
}

const toggleReaction = (r: string) => {
  solid.value.reaction = solid.value.reaction === r ? '' : r
}

watch(
  () => form.sleeping,
  (v) => {
    if (form.type !== 'sleep') {
      return
    }
    form.endTime = v ? null : (form.endTime ?? Math.max(Date.now(), form.time + 60_000))
  },
)

const sleepHint = computed(() => {
  if (form.type !== 'sleep' || form.endTime === null) {
    return ''
  }
  const min = (form.endTime - form.time) / 60000
  return min > 0 ? `共 ${fmtDuration(min)}` : '醒来时间需晚于入睡时间'
})

const preview = computed(() => (props.log ? summarizeLog(props.log) : ''))
const alert = computed(() => (props.log ? abnormalReason(props.log) : null))

/* ── 保存 / 删除 ────────────────────────────────────────────────────────── */

function validate(): string | null {
  if (form.type === 'sleep' && form.endTime !== null && form.endTime <= form.time) {
    return '醒来时间需晚于入睡时间'
  }
  if (form.type === 'milk' && milk.value.mode !== 'breast' && !milk.value.amount) {
    return '请填写奶量'
  }
  if (form.type === 'medicine' && !med.value.name.trim()) {
    return '请填写药品名称'
  }
  if (form.type === 'other' && !other.value.title.trim() && !form.note.trim()) {
    return '请填写记录内容'
  }
  return null
}

async function save() {
  const err = validate()
  if (err) {
    await run(() => Promise.reject(new Error(err)))
    return
  }
  const data = clone(form.data)
  if (form.type === 'milk') {
    const m = data as LogDataMap['milk']
    if (m.mode === 'breast') {
      m.amount = null
    } else {
      m.duration = null
      m.side = null
    }
  }
  const input: LogInput = {
    type: form.type, time: form.time, endTime: form.type === 'sleep' ? form.endTime : null, data, note: form.note,
    source: props.preset?.source, taskId: props.preset?.taskId,
  }
  const saved = await run(() => (props.log ? editLog(props.log, input) : addLog(session.baby!.id, input)), props.log ? '已更新' : '已记录')
  if (saved) {
    show.value = false
    emit('saved', saved)
  }
}

async function del() {
  const log = props.log
  if (!log) {
    return
  }
  await showConfirmDialog({ title: '删除记录', message: `确定删除这条${LOG_KINDS[log.type].label}记录吗？` })
  const ok = await run(() => removeLog(log).then(() => true), '已删除')
  if (ok) {
    show.value = false
  }
}
</script>

<template>
  <van-popup v-model:show="show" position="bottom" round closeable teleport="body" :style="{ maxWidth: 'var(--bc-max-w)', left: '50%', transform: 'translateX(-50%)' }">
    <div class="sheet">
      <div class="sheet-head">
        <div class="sheet-title">
          <span class="kind-icon" :style="{ background: kind.color + '22' }">{{ kind.icon }}</span>
          {{ readonly ? '' : editing ? '编辑' : '记录' }}{{ kind.label }}
        </div>
      </div>

      <!-- ── 只读查看（家长查看育儿嫂录入） ── -->
      <template v-if="readonly && log">
        <div class="card card--flat">
          <div class="row row--between">
            <strong>{{ hm(log.time) }}</strong>
            <AuthorTag :user-id="log.createdBy" suffix="记录" />
          </div>
          <div class="preview">{{ preview }}</div>
          <div v-if="alert" class="pill pill--danger">⚠️ {{ alert }}</div>
          <div v-if="log.note" class="text-2">{{ log.note }}</div>
          <p class="muted tip">育儿嫂录入的内容仅育儿嫂可修改，你可以在下方补充备注。</p>
        </div>
      </template>

      <!-- ── 表单 ── -->
      <template v-else>
        <div v-if="!editing && !preset?.type && !type" class="type-switch">
          <ChipGroup v-model="form.type" :options="LOG_TYPES.map((t) => ({ value: t, label: LOG_KINDS[t].label, icon: LOG_KINDS[t].icon }))" @update:model-value="(t) => init(t as LogType)" />
        </div>

        <div class="form-label">{{ form.type === 'sleep' ? '入睡时间' : '时间' }}</div>
        <TimeField v-model="form.time" :label="form.type === 'sleep' ? '入睡时间' : '记录时间'" />

        <!-- 奶量 -->
        <template v-if="form.type === 'milk'">
          <div class="form-label">类型</div>
          <ChipGroup v-model="milk.mode" :options="opts(MILK_MODE_LABEL)" />
          <template v-if="milk.mode !== 'breast'">
            <div class="form-label">奶量（ml）</div>
            <div class="big-stepper">
              <van-stepper :model-value="milk.amount ?? 120" @update:model-value="(v) => (milk.amount = Number(v))" :min="5" :max="400" :step="10" integer input-width="72px" button-size="40px" />
            </div>
            <ChipGroup v-model="milk.amount" :options="MILK_AMOUNTS.map((v) => ({ value: v, label: `${v}` }))" />
          </template>
          <template v-else>
            <div class="form-label">哺乳侧</div>
            <ChipGroup v-model="milk.side" clearable :options="opts(BREAST_SIDE_LABEL)" />
            <div class="form-label">时长（分钟）</div>
            <div class="big-stepper">
              <van-stepper :model-value="milk.duration ?? 10" @update:model-value="(v) => (milk.duration = Number(v))" :min="1" :max="90" integer input-width="72px" button-size="40px" />
            </div>
            <ChipGroup v-model="milk.duration" :options="BREAST_MINUTES.map((v) => ({ value: v, label: `${v}分钟` }))" />
          </template>
        </template>

        <!-- 辅食 -->
        <template v-if="form.type === 'solid'">
          <div class="form-label row row--between">
            <span>吃了什么（可多选）</span>
            <button class="link" type="button" @click="showAllFoods = !showAllFoods">{{ showAllFoods ? '收起' : '更多食材' }}</button>
          </div>
          <ChipGroup v-model="solid.foods" multiple :options="foodOptions" />
          <div class="custom-food">
            <input v-model="customFood" class="input" placeholder="其他食材，回车添加" maxlength="12" enterkeyhint="done" @keyup.enter="addCustomFood" />
            <van-button size="small" round :disabled="!customFood.trim()" @click="addCustomFood">添加</van-button>
          </div>
          <div class="form-label">吃了多少</div>
          <ChipGroup v-model="solid.amount" :options="SOLID_AMOUNTS.map((v) => ({ value: v, label: v }))" />
          <div class="form-label">接受程度</div>
          <ChipGroup v-model="solid.accept" :options="opts(ACCEPT_LABEL)" />
          <div class="form-label">不良反应（无则不选）</div>
          <div class="chips-inline">
            <button v-for="r in REACTIONS" :key="r" type="button" class="mini" :class="{ on: solid.reaction === r }" @click="toggleReaction(r)">{{ r }}</button>
          </div>
        </template>

        <!-- 排便 -->
        <template v-if="form.type === 'diaper'">
          <div class="form-label">类型</div>
          <ChipGroup v-model="diaper.kind" :options="opts(DIAPER_KIND_LABEL)" />
          <template v-if="diaper.kind !== 'pee'">
            <div class="form-label">颜色</div>
            <ChipGroup v-model="diaper.color" clearable :options="STOOL_COLORS.map((c) => ({ value: c.value, label: c.label, color: c.hex }))" />
            <div class="form-label">性状</div>
            <ChipGroup v-model="diaper.texture" clearable :options="STOOL_TEXTURES.map((c) => ({ value: c.value, label: c.label }))" />
            <div class="form-label">量</div>
            <ChipGroup v-model="diaper.volume" clearable :options="opts(STOOL_VOLUME_LABEL)" />
          </template>
        </template>

        <!-- 睡眠 -->
        <template v-if="form.type === 'sleep'">
          <div class="form-label row row--between">
            <span>醒来时间</span>
            <label class="row sleeping"><van-switch v-model="form.sleeping" size="20px" /> 还在睡</label>
          </div>
          <TimeField v-if="!form.sleeping && form.endTime !== null" v-model="form.endTime" label="醒来时间" />
          <div v-else class="muted">保存后首页会显示"正在睡"，醒来时点一下即可结束计时</div>
          <div v-if="sleepHint" class="pill pill--primary hint">{{ sleepHint }}</div>
          <div class="form-label">睡眠质量</div>
          <ChipGroup v-model="sleep.quality" clearable :options="opts(SLEEP_QUALITY_LABEL)" />
        </template>

        <!-- 体温 -->
        <template v-if="form.type === 'temp'">
          <div class="form-label">体温（℃）</div>
          <div class="big-stepper">
            <van-stepper v-model="temp.value" :min="34" :max="43" :step="0.1" :decimal-length="1" input-width="80px" button-size="40px" />
          </div>
          <ChipGroup v-model="temp.value" :options="TEMP_QUICK.map((v) => ({ value: v, label: v.toFixed(1) }))" />
          <div class="form-label">测量方式</div>
          <ChipGroup v-model="temp.method" :options="opts(TEMP_METHOD_LABEL)" />
        </template>

        <!-- 用药 -->
        <template v-if="form.type === 'medicine'">
          <div class="form-label">药品 / 补剂</div>
          <ChipGroup v-model="med.name" :options="MEDICINE_PRESETS.map((v) => ({ value: v, label: v }))" />
          <van-field v-model="med.name" class="field" placeholder="或输入名称" maxlength="20" />
          <div class="form-label">剂量</div>
          <van-field v-model="med.dose" class="field" placeholder="如 1粒 / 2.5ml" maxlength="20" />
        </template>

        <!-- 成长 -->
        <template v-if="form.type === 'growth'">
          <van-cell-group inset class="growth">
            <van-field :model-value="growth.weight ?? ''" type="number" label="体重" placeholder="kg" @update:model-value="(v) => (growth.weight = num(v))" />
            <van-field :model-value="growth.height ?? ''" type="number" label="身高" placeholder="cm" @update:model-value="(v) => (growth.height = num(v))" />
            <van-field :model-value="growth.head ?? ''" type="number" label="头围" placeholder="cm" @update:model-value="(v) => (growth.head = num(v))" />
          </van-cell-group>
        </template>

        <!-- 其他 -->
        <template v-if="form.type === 'other'">
          <div class="form-label">记录什么</div>
          <van-field v-model="other.title" class="field" placeholder="如 洗澡、户外、打疫苗、喝水" maxlength="30" />
        </template>

        <div class="form-label">备注（选填）</div>
        <textarea v-model="form.note" class="textarea" rows="2" maxlength="300" placeholder="宝宝的状态、特别情况…" />

        <div class="sheet-actions">
          <van-button v-if="editing && log && session.actor && can.editLog(session.actor, log)" round plain type="danger" @click="del">删除</van-button>
          <van-button round block type="primary" :loading="busy" @click="save">{{ editing ? '保存修改' : '保存' }}</van-button>
        </div>
      </template>

      <!-- ── 备注串（已存在的记录） ── -->
      <template v-if="log">
        <div class="form-label">家人备注</div>
        <NoteThread target-type="log" :target-id="log.id" :date="log.date" />
      </template>
    </div>
  </van-popup>
</template>

<style scoped>
.kind-icon {
  display: inline-grid;
  place-items: center;
  width: 32px;
  height: 32px;
  margin-right: 6px;
  border-radius: 10px;
}

.sheet-title {
  display: flex;
  align-items: center;
}

.type-switch {
  margin-bottom: var(--sp-3);
}

.big-stepper {
  display: flex;
  justify-content: center;
  margin-bottom: var(--sp-3);
}

.big-stepper :deep(.van-stepper__input) {
  font-size: 22px;
  font-weight: 700;
  height: 40px;
}

.custom-food {
  display: flex;
  gap: var(--sp-2);
  margin-top: var(--sp-2);
}

.input {
  flex: 1;
  min-width: 0;
  height: 34px;
  padding: 0 var(--sp-3);
  border: 1px solid var(--bc-border);
  border-radius: 999px;
  background: var(--bc-surface);
  outline: none;
}

.chips-inline {
  display: flex;
  gap: var(--sp-2);
  flex-wrap: wrap;
}

.mini {
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--bc-border);
  border-radius: 999px;
  background: var(--bc-surface);
  cursor: pointer;
}

.mini.on {
  border-color: var(--bc-danger);
  background: var(--bc-danger-soft);
  color: var(--bc-danger);
}

.sleeping {
  font-size: 13px;
  color: var(--bc-text-2);
}

.hint {
  margin-top: var(--sp-2);
}

.field {
  margin-top: var(--sp-2);
  border: 1px solid var(--bc-border);
  border-radius: var(--bc-radius-sm);
}

.growth {
  margin: var(--sp-3) 0 0;
  border: 1px solid var(--bc-border);
}

.preview {
  margin: var(--sp-2) 0;
  font-size: 16px;
  font-weight: 600;
}

.tip {
  margin: var(--sp-2) 0 0;
  font-size: 12px;
}
</style>
