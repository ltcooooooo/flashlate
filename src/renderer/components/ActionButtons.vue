<script setup lang="ts">
import Icon from './Icon.vue'
import { useCopy } from '../composables/useCopy'
import { useTts } from '../composables/useTts'

const props = defineProps<{ text: string; disabled?: boolean; size?: number }>()

const { status: copyStatus, copy } = useCopy()
const { status: ttsStatus, toggle } = useTts()

const sz = props.size ?? 15
</script>

<template>
  <div class="actions">
    <button
      class="btn-icon"
      :class="{ success: copyStatus === 'ok', error: copyStatus === 'error' }"
      :disabled="disabled || !text"
      :title="copyStatus === 'ok' ? '已复制' : copyStatus === 'error' ? '复制失败' : '复制'"
      :aria-label="'复制'"
      @click="copy(text)"
    >
      <Icon v-if="copyStatus === 'idle'" name="copy" :size="sz" />
      <Icon v-else-if="copyStatus === 'ok'" name="check" :size="sz" />
      <Icon v-else name="alert" :size="sz" />
    </button>

    <button
      class="btn-icon"
      :class="{ active: ttsStatus === 'playing', error: ttsStatus === 'error' }"
      :disabled="disabled || !text"
      :title="ttsStatus === 'playing' ? '停止' : ttsStatus === 'error' ? '发音失败' : '朗读'"
      :aria-label="'朗读'"
      @click="toggle(text)"
    >
      <span v-if="ttsStatus === 'playing'" class="wave" aria-hidden="true">
        <span></span><span></span><span></span>
      </span>
      <Icon v-else-if="ttsStatus === 'loading'" name="volume" :size="sz" class="pulse" />
      <Icon v-else-if="ttsStatus === 'error'" name="alert" :size="sz" />
      <Icon v-else name="volume" :size="sz" />
    </button>
  </div>
</template>

<style scoped>
.actions {
  display: flex;
  gap: 2px;
}
.btn-icon {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
  border: none;
  background: transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--c-text-secondary);
  transition:
    background 0.15s,
    color 0.15s;
  flex-shrink: 0;
}
.btn-icon:hover:not(:disabled) {
  background: var(--c-bg-hover);
  color: var(--c-text);
}
.btn-icon:active:not(:disabled) {
  transform: scale(0.93);
}
.btn-icon:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
.btn-icon.active {
  color: var(--c-primary);
}
.btn-icon.success {
  color: var(--c-success);
}
.btn-icon.error {
  color: var(--c-error);
}
.pulse {
  animation: pulse 0.8s ease-in-out infinite;
}
@keyframes pulse {
  50% {
    opacity: 0.4;
  }
}
.wave {
  display: inline-flex;
  gap: 2px;
  align-items: flex-end;
  height: 15px;
}
.wave span {
  width: 3px;
  background: var(--c-primary);
  border-radius: 2px;
}
.wave span:nth-child(1) {
  animation: wave1 0.6s ease-in-out infinite;
}
.wave span:nth-child(2) {
  animation: wave2 0.5s ease-in-out infinite 0.1s;
}
.wave span:nth-child(3) {
  animation: wave3 0.7s ease-in-out infinite 0.2s;
}
@keyframes wave1 {
  0%,
  100% {
    height: 4px;
  }
  50% {
    height: 14px;
  }
}
@keyframes wave2 {
  0%,
  100% {
    height: 10px;
  }
  50% {
    height: 4px;
  }
}
@keyframes wave3 {
  0%,
  100% {
    height: 6px;
  }
  50% {
    height: 15px;
  }
}
</style>
