/* ============================================================================
 *  useVoice · 浏览器语音识别（Web Speech API）
 * ----------------------------------------------------------------------------
 *  Chrome / Edge / Safari 支持；微信内置浏览器等不支持时 supported=false，
 *  界面退化为文本框 + 输入法自带的语音输入，解析流程完全一致。
 * ========================================================================== */

import { onScopeDispose, ref } from 'vue'

interface RecognitionResult {
  0: { transcript: string }
  isFinal: boolean
}

interface Recognition {
  lang: string
  continuous: boolean
  interimResults: boolean
  start(): void
  stop(): void
  abort(): void
  onresult: ((e: { resultIndex: number; results: ArrayLike<RecognitionResult> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
}

type RecognitionCtor = new () => Recognition

const Ctor = (window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor })
const SR = Ctor.SpeechRecognition ?? Ctor.webkitSpeechRecognition

const ERRORS: Record<string, string> = {
  'not-allowed': '麦克风权限被拒绝，请在浏览器设置中允许',
  'service-not-allowed': '当前浏览器不允许语音识别',
  'no-speech': '没有听到声音，请再说一次',
  network: '语音识别需要联网，离线时请用输入法语音输入',
  'audio-capture': '未检测到麦克风',
}

export function useVoice() {
  const supported = !!SR
  const listening = ref(false)
  const text = ref('')
  const error = ref('')
  let rec: Recognition | null = null
  let committed = ''

  function start(): void {
    if (!SR || listening.value) {
      return
    }
    error.value = ''
    committed = text.value ? `${text.value}，` : ''
    rec = new SR()
    rec.lang = 'zh-CN'
    rec.continuous = true
    rec.interimResults = true
    rec.onresult = (e) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) {
          committed += r[0].transcript
        } else {
          interim += r[0].transcript
        }
      }
      text.value = committed + interim
    }
    rec.onerror = (e) => {
      if (e.error !== 'aborted') {
        error.value = ERRORS[e.error] ?? `语音识别失败（${e.error}）`
      }
    }
    rec.onend = () => {
      listening.value = false
      text.value = text.value.replace(/，$/, '')
    }
    rec.start()
    listening.value = true
  }

  function stop(): void {
    rec?.stop()
  }

  onScopeDispose(() => rec?.abort())

  return { supported, listening, text, error, start, stop }
}
