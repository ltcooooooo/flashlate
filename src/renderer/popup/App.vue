<script setup lang="ts">
import { ref, reactive, computed, onMounted, onBeforeUnmount, nextTick, useTemplateRef } from 'vue'
import Icon from '../components/Icon.vue'
import Select from '../components/Select.vue'
import ActionButtons from '../components/ActionButtons.vue'
import PlatformPanel, { type PanelState } from './PlatformPanel.vue'
import { stopGlobalTts } from '../composables/useTts'
import { useUpdater } from '../composables/useUpdater'
import { SOURCE_LANGUAGES, TARGET_LANGUAGES } from '@shared/langs'
import type {
  EnabledProvider,
  PopupFill,
  TranslatePanelLoading,
  TranslatePanelSuccess,
  TranslatePanelError
} from '@shared/types'

const MAX_CHARS = 5000

const sourceLang = ref('auto')
const targetLang = ref('zh')
const text = ref('')
const pinned = ref(false)
const providers = ref<EnabledProvider[]>([])
const panels = reactive<Record<string, PanelState>>({})
const ocrState = ref<{ state: string; message?: string } | null>(null)

const cardRef = useTemplateRef<HTMLElement>('card')
const inputRef = useTemplateRef<HTMLTextAreaElement>('input')

const sourceOptions = computed(() =>
  SOURCE_LANGUAGES.map((l) => ({ value: l.code, label: l.name }))
)
const targetOptions = computed(() =>
  TARGET_LANGUAGES.map((l) => ({ value: l.code, label: l.name }))
)

let latestRid = 0
const unsubs: Array<() => void> = []

function ensurePanel(id: string): PanelState {
  if (!panels[id]) {
    panels[id] = { status: 'idle', text: '', message: '', expanded: false }
  }
  return panels[id]
}

async function refreshProviders(): Promise<void> {
  providers.value = await window.flash.getEnabledProviders()
  for (const p of providers.value) ensurePanel(p.id)
}

function resetPanels(): void {
  for (const p of providers.value) {
    panels[p.id] = { status: 'idle', text: '', message: '', expanded: false }
  }
}

async function runTranslate(): Promise<void> {
  const t = text.value.trim()
  if (!t) return
  await refreshProviders()
  if (!providers.value.length) return
  await window.flash.translate({ text: t, source: sourceLang.value, target: targetLang.value })
}

function onEnter(e: KeyboardEvent): void {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    void runTranslate()
  }
}

function togglePin(): void {
  pinned.value = !pinned.value
  void window.flash.setPin(pinned.value)
}

function openSettings(): void {
  void window.flash.openSettings()
}

// 更新可用图标 → 打开设置并定位「关于」板块（完整更新流程在关于页）
const { available: updateAvailable } = useUpdater()
function openUpdate(): void {
  void window.flash.openSettings('about')
}

// ESC 显式关闭弹窗（无视 Pin），并中断进行中的翻译
function onGlobalKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.preventDefault()
    void window.flash.hidePopup(true)
  }
}

async function changeLangs(): Promise<void> {
  await window.flash.setLangs({ sourceLang: sourceLang.value, targetLang: targetLang.value })
  if (text.value.trim()) void runTranslate()
}

// ---------- 自适应高度 ----------
let ro: ResizeObserver | null = null
function observeHeight(): void {
  if (!cardRef.value) return
  ro = new ResizeObserver(() => {
    const h = cardRef.value?.offsetHeight ?? 0
    if (h > 0) void window.flash.resizePopup(h + 52) // +上下透明留白(16+36)
  })
  ro.observe(cardRef.value)
}

onMounted(async () => {
  const { config } = await window.flash.getConfig()
  sourceLang.value = config.translate.sourceLang
  targetLang.value = config.translate.targetLang
  await refreshProviders()

  unsubs.push(
    window.flash.on('popup:fill', (...a: unknown[]) => {
      const payload = a[0] as PopupFill
      ocrState.value = null
      text.value = payload.text ?? ''
      if (payload.empty || !payload.text) {
        resetPanels()
      } else {
        void runTranslate()
      }
    })
  )
  unsubs.push(
    window.flash.on('popup:focus-input', () => {
      nextTick(() => inputRef.value?.focus())
    })
  )
  unsubs.push(
    window.flash.on('panel:loading', (...a: unknown[]) => {
      const p = a[0] as TranslatePanelLoading
      if (p.requestId > latestRid) latestRid = p.requestId
      if (p.requestId < latestRid) return
      const panel = ensurePanel(p.providerId)
      panel.status = 'loading'
      panel.text = ''
      panel.message = ''
      panel.expanded = false
    })
  )
  unsubs.push(
    window.flash.on('panel:success', (...a: unknown[]) => {
      const p = a[0] as TranslatePanelSuccess
      if (p.requestId < latestRid) return
      const panel = ensurePanel(p.providerId)
      if (p.delta) {
        panel.text += p.text
        panel.status = 'success'
        panel.expanded = true
      } else {
        panel.text = p.text
        panel.status = 'success'
        panel.expanded = true
      }
    })
  )
  unsubs.push(
    window.flash.on('panel:error', (...a: unknown[]) => {
      const p = a[0] as TranslatePanelError
      if (p.requestId < latestRid) return
      const panel = ensurePanel(p.providerId)
      panel.status = 'error'
      panel.message = p.message
      panel.expanded = true
    })
  )
  unsubs.push(
    window.flash.on('config:changed', () => {
      void window.flash.getConfig().then(({ config }) => {
        sourceLang.value = config.translate.sourceLang
        targetLang.value = config.translate.targetLang
      })
      void refreshProviders()
    })
  )
  unsubs.push(
    window.flash.on('ocr:status', (...a: unknown[]) => {
      const s = a[0] as { state: string; message?: string }
      ocrState.value = s.state === 'done' ? null : s
    })
  )
  unsubs.push(
    window.flash.on('popup:hidden', () => {
      // 弹窗隐藏（失焦/ESC 等）时停止正在播放的发音
      stopGlobalTts()
    })
  )

  observeHeight()
  window.addEventListener('keydown', onGlobalKey)
})

onBeforeUnmount(() => {
  unsubs.forEach((u) => u())
  ro?.disconnect()
  window.removeEventListener('keydown', onGlobalKey)
})
</script>

<template>
  <div ref="card" class="popup">
    <div class="popup-header drag">
      <!-- <div class="drag-handle" title="拖拽移动"></div> -->
      <Select
        v-model="sourceLang"
        :options="sourceOptions"
        size="sm"
        aria-label="源语言"
        @update:model-value="changeLangs"
      />
      <Icon name="arrowRight" :size="13" class="arrow" />
      <Select
        v-model="targetLang"
        :options="targetOptions"
        size="sm"
        aria-label="目标语言"
        @update:model-value="changeLangs"
      />
      <button
        v-if="updateAvailable"
        class="btn-icon has-update"
        title="有可用更新，点击查看"
        aria-label="有可用更新"
        @click="openUpdate"
      >
        <Icon name="download" :size="15" />
      </button>
      <button
        class="btn-icon"
        :class="{ pinned }"
        :title="pinned ? '已置顶（失焦不隐藏）' : '窗口置顶'"
        aria-label="窗口置顶"
        @click="togglePin"
      >
        <Icon name="pin" :size="15" />
      </button>
      <button class="btn-icon" title="设置" aria-label="设置" @click="openSettings">
        <Icon name="settings" :size="15" />
      </button>
    </div>

    <div class="popup-body">
      <div class="input-area">
        <textarea
          ref="input"
          v-model="text"
          :maxlength="MAX_CHARS"
          placeholder="输入文本后按 Enter 翻译…"
          rows="3"
          @keydown="onEnter"
        ></textarea>
        <div class="input-toolbar">
          <span class="char-count" :class="{ warn: text.length > 4500 }">
            {{ text.length }} / {{ MAX_CHARS }}
          </span>
          <ActionButtons :text="text" :disabled="!text.trim()" />
        </div>
      </div>

      <div v-if="ocrState" class="ocr-status" :class="{ error: ocrState.state === 'error' }">
        <span v-if="ocrState.state === 'recognizing'" class="spinner-sm"></span>
        <Icon v-else name="alert" :size="13" />
        <span>{{ ocrState.state === 'recognizing' ? '识别中…' : ocrState.message }}</span>
      </div>

      <div v-if="!providers.length" class="empty-hint">
        未启用任何翻译平台，请在
        <a href="#" @click.prevent="openSettings">设置</a> 中配置 API 密钥
      </div>

      <div class="panels">
        <PlatformPanel
          v-for="p in providers"
          :id="p.id"
          :key="p.id"
          :name="p.name"
          :icontext="p.id === 'niu' ? '牛' : undefined"
          :state="ensurePanel(p.id)"
          @toggle="panels[p.id].expanded = !panels[p.id].expanded"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.popup {
  width: calc(100% - 52px);
  margin: 16px 26px 36px;
  background: var(--c-bg);
  border-radius: var(--radius-md);
  box-shadow: var(--c-shadow);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.popup-header {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--c-border);
}
.popup-header > * {
  -webkit-app-region: no-drag;
}
.drag {
  -webkit-app-region: drag;
}
.arrow {
  color: var(--c-text-tertiary);
  flex-shrink: 0;
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
.btn-icon:hover {
  background: var(--c-bg-hover);
  color: var(--c-text);
}
.btn-icon.pinned {
  color: var(--c-primary);
  background: var(--c-primary-light);
}
/* 有可用更新：主题色 + 轻微脉动，提示可点击查看 */
.btn-icon.has-update {
  color: var(--c-primary);
  animation: update-pulse 1.6s ease-in-out infinite;
}
@keyframes update-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.45;
  }
}
.popup-body {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 540px;
  overflow-y: auto;
}
.input-area {
  display: flex;
  flex-direction: column;
  min-height: fit-content;
  border: 1px solid var(--c-border);
  border-radius: var(--radius-sm);
  overflow: hidden;
  transition:
    border-color 0.2s,
    box-shadow 0.2s;
}
.input-area:focus-within {
  border-color: var(--c-primary);
  box-shadow: 0 0 0 3px var(--c-primary-ring);
}
.input-area textarea {
  width: 100%;
  min-height: 64px;
  max-height: 160px;
  resize: none;
  border: none;
  outline: none;
  padding: 10px 12px;
  font: 14px/1.6 var(--font);
  color: var(--c-text);
  background: transparent;
}
.input-area textarea::placeholder {
  color: var(--c-text-tertiary);
}
.input-area textarea::-webkit-scrollbar {
  width: 5px;
}
.input-area textarea::-webkit-scrollbar-thumb {
  background: var(--c-border-strong);
  border-radius: 3px;
}
/* 底部工具条：字数 + 复制/朗读，与文字区用分隔线隔开，永不重叠 */
.input-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 6px 4px 12px;
  border-top: 1px solid var(--c-border);
  background: var(--c-bg-subtle);
}
.char-count {
  font-size: 11px;
  color: var(--c-text-tertiary);
}
.char-count.warn {
  color: var(--c-warn);
}
.panels {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.empty-hint {
  font-size: 12px;
  color: var(--c-text-tertiary);
  text-align: center;
  padding: 8px;
  line-height: 1.6;
}
.empty-hint a {
  color: var(--c-primary);
  cursor: pointer;
}
.ocr-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--c-text-secondary);
  padding: 2px 2px;
}
.ocr-status.error {
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
