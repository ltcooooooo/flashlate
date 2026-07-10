<script setup lang="ts">
import { ref } from 'vue'
import Icon from '../../components/Icon.vue'
import type { ProviderKind, VerifyResult } from '@shared/types'

const props = defineProps<{
  kind: ProviderKind
  id: string
  config: Record<string, string>
  disabled?: boolean
}>()

type State = 'idle' | 'testing' | 'ok' | 'fail'
const state = ref<State>('idle')
const message = ref('')

async function test(): Promise<void> {
  if (state.value === 'testing') return
  state.value = 'testing'
  message.value = ''
  if (props.kind === 'tts') {
    await playTtsSamples()
  } else {
    await verifyProvider()
  }
}

async function verifyProvider(): Promise<void> {
  const res: VerifyResult = await window.flash.testProvider({
    kind: props.kind,
    id: props.id,
    config: props.config
  })
  state.value = res.ok ? 'ok' : 'fail'
  message.value = res.ok ? `可用${res.ms ? ` · ${res.ms}ms` : ''}` : res.message
}

// TTS 测试：依序播放当前嗓音的中英文样本，验证语音通道可用
const TTS_SAMPLES: ReadonlyArray<{ text: string; lang: 'zh' | 'en' }> = [
  { text: '我正在播放一段测试文本', lang: 'zh' },
  { text: 'I am playing a test text right now', lang: 'en' }
]

async function playTtsSamples(): Promise<void> {
  try {
    for (let i = 0; i < TTS_SAMPLES.length; i++) {
      const sample = TTS_SAMPLES[i]
      message.value = `播放 ${i + 1}/${TTS_SAMPLES.length}…`
      const res = await window.flash.speak(sample.text)
      if (!res.ok || !res.audioBase64) {
        state.value = 'fail'
        message.value =
          `${sample.lang === 'zh' ? '中文' : '英文'} 播放失败` +
          (res.message ? ` · ${res.message}` : '')
        return
      }
      await playAudio(res.audioBase64)
    }
    state.value = 'ok'
    message.value = ''
  } catch (e) {
    state.value = 'fail'
    message.value = e instanceof Error ? e.message : '播放失败'
  }
}

function playAudio(base64: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const audio = new Audio('data:audio/mp3;base64,' + base64)
    let settled = false
    const settle = (err?: Error): void => {
      if (settled) return
      settled = true
      if (err) reject(err)
      else resolve()
    }
    audio.onended = (): void => settle()
    audio.onerror = (): void => settle(new Error('音频解码失败'))
    audio.play().catch((e: Error) => settle(e))
  })
}

defineExpose({ test, state })
</script>

<template>
  <div class="test-row">
    <button class="test-btn" :disabled="disabled || state === 'testing'" @click="test">
      <span v-if="state === 'testing'" class="spinner-sm"></span>
      <span>{{ state === 'testing' ? '测试中' : '测试' }}</span>
    </button>
    <span v-if="state === 'ok'" class="result ok">
      <Icon name="check" :size="13" /> {{ message }}
    </span>
    <span v-else-if="state === 'fail'" class="result fail">
      <Icon name="alert" :size="13" /> {{ message }}
    </span>
  </div>
</template>

<style scoped>
.test-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  min-height: 24px;
}
.test-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 12px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--c-border);
  background: var(--c-bg);
  font-size: 12px;
  color: var(--c-text);
  cursor: pointer;
  transition:
    border-color 0.15s,
    background 0.15s;
}
.test-btn:hover:not(:disabled) {
  border-color: var(--c-primary);
  color: var(--c-primary);
}
.test-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.result {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
}
.result.ok {
  color: var(--c-success);
}
.result.fail {
  color: var(--c-error);
}
.spinner-sm {
  width: 12px;
  height: 12px;
  border: 2px solid var(--c-border);
  border-top-color: var(--c-primary);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
