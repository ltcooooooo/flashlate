<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Icon from '../../components/Icon.vue'
import Toggle from './Toggle.vue'
import KeyInput from './KeyInput.vue'

interface Field {
  key: string
  label: string
  placeholder?: string
}

const props = defineProps<{
  id: 'local' | 'tmt' | 'glm' | 'niu'
  name: string
  hint: string
  badge: 'free' | 'key'
  fields: Field[]
  // 该平台的配置对象（parent reactive cfg 的引用，可直接读写）
  config: Record<string, unknown>
}>()

const emit = defineEmits<{ persist: [] }>()

const autoState = ref<'idle' | 'verifying' | 'ok' | 'fail'>('idle')
const autoMsg = ref('')

const complete = computed(() => props.fields.every((f) => String(props.config[f.key] ?? '').trim()))

// 密钥区折叠：已填好的默认收起；用户一旦手动操作或编辑则不再自动收起
const collapsed = ref(false)
let autoCollapse = true
watch(
  complete,
  (v) => {
    if (autoCollapse) collapsed.value = v
  },
  { immediate: true }
)
function toggleCollapse(): void {
  autoCollapse = false
  collapsed.value = !collapsed.value
}
function onFieldInput(key: string, val: string): void {
  autoCollapse = false
  props.config[key] = val
  // 编辑密钥即清除上一次校验提示（避免提示长期滞留）
  if (autoState.value !== 'verifying') {
    autoState.value = 'idle'
    autoMsg.value = ''
  }
}

const enabled = computed({
  get: () => Boolean(props.config.enabled),
  // 与腾讯 TMT 统一：开关由 onToggle 接管，开启前先校验
  set: (v: boolean) => void onToggle(v)
})

// 测试用配置（去掉 enabled）
const testConfig = computed(() => {
  const out: Record<string, string> = {}
  for (const k of Object.keys(props.config)) {
    if (k === 'enabled') continue
    out[k] = String(props.config[k] ?? '')
  }
  return out
})

// Key 字段失焦：仅持久化，不做校验（与腾讯 TMT 统一，校验只发生在开启/测试时）。
// 必填被清空时同步关闭开关，避免“已启用但密钥不全”。
function onKeyCommit(): void {
  if (!complete.value && props.config.enabled) {
    props.config.enabled = false
    autoState.value = 'idle'
    autoMsg.value = ''
  }
  emit('persist')
}

// 共用一次校验：测试按钮与开启开关都走这里，结果只写入同一处 autoState/autoMsg。
async function verify(): Promise<boolean> {
  autoState.value = 'verifying'
  autoMsg.value = '正在验证密钥…'
  const res = await window.flash.testProvider({
    kind: 'translate',
    id: props.id,
    config: testConfig.value
  })
  if (res.ok) {
    autoState.value = 'ok'
    autoMsg.value = `密钥有效${res.ms ? ` · ${res.ms}ms` : ''}`
  } else {
    autoState.value = 'fail'
    autoMsg.value = `密钥校验失败：${res.message}`
  }
  return res.ok
}

// 开关切换：开启前先校验，通过才点亮；失败回退到关闭（保证开关外观与实际状态一致）。
async function onToggle(next: boolean): Promise<void> {
  if (!next) {
    props.config.enabled = false
    autoState.value = 'idle'
    autoMsg.value = ''
    emit('persist')
    return
  }
  if (!complete.value || autoState.value === 'verifying') return

  // 乐观点亮，失败再设回 false——制造 false→true→false 变化，确保开关 DOM 回弹
  props.config.enabled = true
  const ok = await verify()
  if (ok) {
    // 成功保留“密钥有效”提示，与测试按钮表现一致
    emit('persist')
  } else {
    props.config.enabled = false
    emit('persist')
  }
}

// 测试按钮：只校验、不改变开关状态，复用同一提示区。
async function onTest(): Promise<void> {
  if (!complete.value || autoState.value === 'verifying') return
  await verify()
}
</script>

<template>
  <div class="provider" :class="{ collapsed }">
    <div class="provider-head" role="button" :aria-expanded="!collapsed" @click="toggleCollapse">
      <span class="provider-name">{{ name }}</span>
      <span class="hint">{{ hint }}</span>
      <span class="badge" :class="badge === 'free' ? 'badge-free' : 'badge-key'">
        {{ badge === 'free' ? '免费' : '需 Key' }}
      </span>
      <span class="toggle-stop" @click.stop>
        <Toggle v-model="enabled" :disabled="!complete" />
      </span>
      <button class="provider-chevron-btn" aria-label="展开或收起" :aria-expanded="!collapsed">
        <Icon name="chevronDown" :size="16" class="provider-chevron" />
      </button>
    </div>

    <div class="provider-body">
      <div class="provider-body-inner">
        <KeyInput
          v-for="f in fields"
          :key="f.key"
          :model-value="String(config[f.key] ?? '')"
          :label="f.label"
          :placeholder="f.placeholder ?? f.label"
          @update:model-value="onFieldInput(f.key, $event)"
          @commit="onKeyCommit"
        />

        <div class="provider-foot">
          <button
            class="test-btn"
            :disabled="!complete || autoState === 'verifying'"
            @click="onTest"
          >
            <span v-if="autoState === 'verifying'" class="spinner-sm"></span>
            <span>{{ autoState === 'verifying' ? '测试中' : '测试' }}</span>
          </button>
          <span
            v-if="autoState === 'ok' || autoState === 'fail'"
            class="auto-msg"
            :class="{ ok: autoState === 'ok', fail: autoState === 'fail' }"
          >
            <Icon :name="autoState === 'ok' ? 'check' : 'alert'" :size="13" />
            {{ autoMsg }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.provider {
  padding: 12px 16px;
  border: 1px solid var(--c-border);
  border-radius: var(--radius-md);
  background: var(--c-bg);
  box-shadow: var(--c-shadow-card);
}
.provider + .provider {
  margin-top: 12px;
}
.provider-head {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
}
.toggle-stop {
  display: inline-flex;
}
.provider-chevron-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: var(--c-text-tertiary);
  border-radius: var(--radius-sm);
  cursor: pointer;
  flex-shrink: 0;
  transition:
    background 0.15s,
    color 0.15s;
}
.provider-chevron-btn:hover {
  background: var(--c-bg-hover);
  color: var(--c-text);
}
.provider-chevron {
  flex-shrink: 0;
  transition: transform 0.2s ease;
}
.provider.collapsed .provider-chevron {
  transform: rotate(-90deg);
}
.provider-body {
  display: grid;
  grid-template-rows: 1fr;
  transition: grid-template-rows 0.25s ease;
}
.provider.collapsed .provider-body {
  grid-template-rows: 0fr;
}
.provider-body-inner {
  overflow: hidden;
  min-height: 0;
}
.provider-name {
  font-weight: 600;
  font-size: 13px;
}
.hint {
  font-size: 11px;
  color: var(--c-text-tertiary);
  flex: 1;
}
.badge {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 10px;
  font-weight: 600;
}
.badge-free {
  background: var(--c-success-light);
  color: #065f46;
}
.badge-key {
  background: var(--c-warn-light);
  color: #92400e;
}
.provider-foot {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 8px;
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
.auto-msg {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--c-text-secondary);
}
.auto-msg.ok {
  color: var(--c-success);
}
.auto-msg.fail {
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
