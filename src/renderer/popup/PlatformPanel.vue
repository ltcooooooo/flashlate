<script setup lang="ts">
import { computed } from 'vue'
import Icon from '../components/Icon.vue'
import ActionButtons from '../components/ActionButtons.vue'

export interface PanelState {
  status: 'idle' | 'loading' | 'success' | 'error'
  text: string
  message: string
  expanded: boolean
}

const props = defineProps<{ id: string; name: string; state: PanelState; icontext?: string }>()
const emit = defineEmits<{ toggle: [] }>()

const iconText = computed(() => props.icontext ?? props.name.charAt(0))
const colorClass = computed(() => `platform-${props.id}`)

const errorMessage = computed(() =>
  props.state.status === 'error' ? props.state.message || '翻译失败' : ''
)

const canExpand = computed(() => props.state.status === 'success' || props.state.status === 'error')
</script>

<template>
  <div class="panel" :class="[state.status, { expanded: state.expanded }]">
    <div
      class="panel-header"
      role="button"
      :aria-expanded="state.expanded"
      @click="canExpand && emit('toggle')"
    >
      <span class="platform-icon" :class="colorClass">{{ iconText }}</span>
      <span class="platform-name">{{ name }}</span>
      <span v-if="state.status === 'loading'" class="spinner" aria-label="翻译中"></span>
      <span
        v-else-if="state.status === 'success'"
        class="status-icon status-success"
        aria-label="翻译完成"
      >
        <Icon name="check" :size="14" />
      </span>
      <span
        v-else-if="state.status === 'error'"
        class="status-icon status-error"
        :title="errorMessage"
        aria-label="翻译失败"
      >
        <Icon name="alert" :size="14" />
      </span>
      <span v-else class="platform-status">等待翻译</span>
    </div>
    <div class="panel-body">
      <div class="panel-inner">
        <div class="panel-result">{{ state.text || state.message }}</div>
        <div v-if="state.status === 'success'" class="panel-result-actions">
          <ActionButtons :text="state.text" :size="14" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.panel {
  border: 1px solid var(--c-border);
  border-radius: var(--radius-sm);
  overflow: hidden;
  transition: border-color 0.2s;
}
.panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: default;
  font-size: 12px;
  font-weight: 600;
  color: var(--c-text-secondary);
  transition: background 0.15s;
}
.panel.success .panel-header,
.panel.error .panel-header {
  cursor: pointer;
}
.panel.success .panel-header:hover,
.panel.error .panel-header:hover {
  background: var(--c-bg-hover);
}
.platform-icon {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  color: #fff;
  flex-shrink: 0;
}
.platform-name {
  flex: 1;
}
.platform-status {
  font-size: 11px;
  font-weight: 400;
}
.status-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.status-icon.status-success {
  color: var(--c-success);
}
.status-icon.status-error {
  color: var(--c-error);
}
.platform-tmt {
  background: #4f46e5;
}
.platform-glm {
  background: #0ea5e9;
}
.platform-niu {
  background: #0ea5e9;
}
.platform-local {
  background: #10b981;
}

/* 展开动画：grid-template-rows 0fr→1fr，平滑且无需测高 */
.panel-body {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 0.25s ease;
}
.panel.expanded .panel-body {
  grid-template-rows: 1fr;
}
.panel-inner {
  overflow: hidden;
  min-height: 0;
}
.panel-result {
  padding: 2px 12px 8px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--c-text);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 200px;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.panel-result::-webkit-scrollbar {
  width: 5px;
}
.panel-result::-webkit-scrollbar-thumb {
  background: var(--c-border-strong);
  border-radius: 3px;
}
.panel.error .panel-result {
  color: var(--c-error);
}
/* 底部工具条：与输入框工具条一致（分隔线 + 同款底色），右对齐 */
.panel-result-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 4px 6px;
  border-top: 1px solid var(--c-border);
  background: var(--c-bg-subtle);
}
.spinner {
  width: 14px;
  height: 14px;
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
