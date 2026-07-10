<script setup lang="ts">
import { ref } from 'vue'
import Icon from '../../components/Icon.vue'

const model = defineModel<string>({ required: true })
defineProps<{ placeholder?: string; label?: string }>()
const emit = defineEmits<{ commit: [] }>()

const reveal = ref(false)
</script>

<template>
  <div class="key-field">
    <label v-if="label" class="key-label">{{ label }}</label>
    <div class="key-input-wrap">
      <input
        v-model="model"
        :type="reveal ? 'text' : 'password'"
        :placeholder="placeholder"
        class="key-input"
        spellcheck="false"
        autocomplete="off"
        @blur="emit('commit')"
      />
      <button
        type="button"
        class="reveal-btn"
        :title="reveal ? '隐藏' : '显示'"
        :aria-label="reveal ? '隐藏密钥' : '显示密钥'"
        @click="reveal = !reveal"
      >
        <Icon :name="reveal ? 'eyeOff' : 'eye'" :size="14" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.key-field {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
}
.key-label {
  font-size: 12px;
  color: var(--c-text-secondary);
  width: 76px;
  flex-shrink: 0;
}
.key-input-wrap {
  position: relative;
  flex: 1;
}
.key-input {
  width: 100%;
  padding: 6px 30px 6px 10px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--c-border);
  font: 12px var(--font-mono);
  background: var(--c-bg-subtle);
  color: var(--c-text);
  outline: none;
}
.key-input:focus {
  border-color: var(--c-primary);
}
.reveal-btn {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  width: 22px;
  height: 22px;
  border: none;
  background: transparent;
  color: var(--c-text-tertiary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
}
.reveal-btn:hover {
  color: var(--c-text);
  background: var(--c-bg-hover);
}
</style>
