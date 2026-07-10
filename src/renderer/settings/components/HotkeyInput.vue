<script setup lang="ts">
import { ref } from 'vue'

const model = defineModel<string>({ required: true })
const emit = defineEmits<{ commit: [accelerator: string] }>()

const capturing = ref(false)
const conflict = ref(false)
const display = ref('')

function startCapture(): void {
  capturing.value = true
  conflict.value = false
  display.value = '按下快捷键…'
}

function toAccelerator(e: KeyboardEvent): string | null {
  const mods: string[] = []
  if (e.ctrlKey) mods.push('Ctrl')
  if (e.altKey) mods.push('Alt')
  if (e.shiftKey) mods.push('Shift')
  if (e.metaKey) mods.push(process.platform === 'darwin' ? 'Cmd' : 'Super')

  const key = e.key
  // 单独的修饰键不构成有效热键
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(key)) return null
  let main = key
  if (key === ' ') main = 'Space'
  else if (key.length === 1) main = key.toUpperCase()
  else main = key // F1, ArrowUp 等

  if (!mods.length) return null // 必须含至少一个修饰键，避免误触
  return [...mods, main].join('+')
}

async function onKeydown(e: KeyboardEvent): Promise<void> {
  if (!capturing.value) return
  e.preventDefault()
  if (e.key === 'Escape') {
    capturing.value = false
    display.value = ''
    return
  }
  const accel = toAccelerator(e)
  if (!accel) {
    display.value = '请配合 Ctrl/Alt/Shift…'
    return
  }
  const { ok } = await window.flash.validateHotkey(accel)
  if (!ok) {
    conflict.value = true
    display.value = `${accel}（已被占用）`
    return
  }
  conflict.value = false
  capturing.value = false
  display.value = ''
  model.value = accel
  emit('commit', accel)
}

function onBlur(): void {
  capturing.value = false
  display.value = ''
}
</script>

<template>
  <input
    class="hotkey-input"
    :class="{ conflict, capturing }"
    :value="capturing ? display : model"
    readonly
    :title="capturing ? '按下新快捷键，Esc 取消' : '点击后按下快捷键'"
    @click="startCapture"
    @keydown="onKeydown"
    @blur="onBlur"
  />
</template>

<style scoped>
.hotkey-input {
  width: 116px;
  padding: 5px 8px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--c-border);
  font: 12px var(--font-mono);
  text-align: center;
  background: var(--c-bg-subtle);
  color: var(--c-text);
  cursor: pointer;
  outline: none;
}
.hotkey-input.capturing {
  border-color: var(--c-primary);
  box-shadow: 0 0 0 3px var(--c-primary-ring);
}
.hotkey-input.conflict {
  border-color: var(--c-error);
  background: var(--c-error-light);
}
</style>
