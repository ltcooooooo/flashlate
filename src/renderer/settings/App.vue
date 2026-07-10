<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted } from 'vue'
import Icon from '../components/Icon.vue'
import Select from '../components/Select.vue'
import HotkeyInput from './components/HotkeyInput.vue'
import TranslateProvider from './components/TranslateProvider.vue'
import KeyInput from './components/KeyInput.vue'
import TestButton from './components/TestButton.vue'
import Toggle from './components/Toggle.vue'
import { useUpdater } from '../composables/useUpdater'
import { SOURCE_LANGUAGES, TARGET_LANGUAGES } from '@shared/langs'
import type { AppConfig, TtsVoice, SettingsSection } from '@shared/types'

const appVersion = ref('')
// 更新状态机（关于页承载完整流程）
const {
  status: updateState,
  isMac: updateIsMac,
  tipText: updateTip,
  check: checkUpdate,
  primaryAction: updatePrimary
} = useUpdater()

type Tab = 'general' | 'translate' | 'tts' | 'ocr' | 'about'
const tab = ref<Tab>('general')
// 「检查更新」按钮：检查中 / 下载中 / 已下载等待重启 时禁用，避免重复触发
const updateCheckDisabled = computed(
  () =>
    updateState.value === 'checking' ||
    updateState.value === 'downloading' ||
    updateState.value === 'downloaded'
)
// 主操作按键（去下载 / 开始更新 / 正在下载 / 立即重启）；按钮文案与可用性联动
const updateActionLabel = computed<string | null>(() => {
  if (updateIsMac.value) {
    return updateState.value === 'available' ? '去下载' : null
  }
  switch (updateState.value) {
    case 'available':
      return '开始更新'
    case 'downloading':
      return '正在下载' // 进度详见 tipText「下载中 X%」，按钮不重复渲染
    case 'downloaded':
      return '立即重启'
    default:
      return null
  }
})
// 下载中和错误态主操作禁用（其它可点击）
const updateActionDisabled = computed(
  () => updateState.value === 'downloading' || updateState.value === 'error'
)
const TABS: Array<{ id: Tab; label: string; icon: string }> = [
  { id: 'general', label: '通用', icon: 'keyboard' },
  { id: 'translate', label: '翻译', icon: 'globe' },
  { id: 'tts', label: '发音', icon: 'volume' },
  { id: 'ocr', label: 'OCR', icon: 'camera' },
  { id: 'about', label: '关于', icon: 'info' }
]

const cfg = reactive<AppConfig>({
  general: { autoLaunch: false },
  hotkeys: { input: '', selection: '', ocr: '' },
  translate: {
    sourceLang: 'auto',
    targetLang: 'zh',
    providers: {
      local: { enabled: false },
      tmt: { enabled: false, secretId: '', secretKey: '', region: 'ap-guangzhou' },
      glm: { enabled: false, apiKey: '' },
      niu: { enabled: false, appId: '', apiKey: '' }
    }
  },
  tts: { active: 'edge', voice: 'zh-CN-XiaoxiaoNeural' },
  ocr: {
    active: 'baidu',
    providers: {
      baidu: { apiKey: '', secretKey: '' },
      tencent: { reuseTmt: true, secretId: '', secretKey: '', region: 'ap-guangzhou' }
    }
  }
})
const encryptionAvailable = ref(true)
const voices = ref<TtsVoice[]>([])
const hotkeyConflict = ref<Record<string, boolean>>({})

const sourceOptions = computed(() =>
  SOURCE_LANGUAGES.map((l) => ({ value: l.code, label: l.name }))
)
const targetOptions = computed(() =>
  TARGET_LANGUAGES.map((l) => ({ value: l.code, label: l.name }))
)

onMounted(async () => {
  const { config, encryptionAvailable: enc } = await window.flash.getConfig()
  appVersion.value = await window.flash.getVersion()
  Object.assign(cfg, config)
  encryptionAvailable.value = enc
  window.flash.getVoices().then((v) => (voices.value = v))
  // 托盘修改了配置 → 重新拉取以保证 UI 同步（不必手动逐字段合并）
  window.flash.on('config:changed', async () => {
    const { config: next } = await window.flash.getConfig()
    Object.assign(cfg, next)
  })
  // 同步定位：阅读主进程预留的 pendingSection，确保首次创建窗口也能直接落在目标 tab
  const pending = await window.flash.getSettingsSection()
  if (pending) tab.value = pending
  // 后续 live 触发的导航（窗口已存在时 openSettings 仍走此通道）
  window.flash.on('settings:navigate', (...args: unknown[]) => {
    tab.value = args[0] as SettingsSection
  })
})

// ---------- 持久化 ----------
async function saveHotkey(): Promise<void> {
  const result = await window.flash.setHotkeys({ ...cfg.hotkeys })
  hotkeyConflict.value = Object.fromEntries(Object.entries(result).map(([k, ok]) => [k, !ok]))
}
function saveGeneral(): void {
  void window.flash.setGeneral({ ...cfg.general })
}
function saveLangs(): void {
  void window.flash.setLangs({
    sourceLang: cfg.translate.sourceLang,
    targetLang: cfg.translate.targetLang
  })
}
function saveTranslate(): void {
  void window.flash.setTranslateProviders(JSON.parse(JSON.stringify(cfg.translate)))
}

function saveTts(): void {
  void window.flash.setTts({ ...cfg.tts })
}
function saveOcr(): void {
  void window.flash.setOcr(JSON.parse(JSON.stringify(cfg.ocr)))
}

// ---------- TTS ----------
const ttsTestConfig = computed(() => ({}))
// 按 locale 分组嗓音，限制下拉规模
const voiceOptions = computed(() =>
  voices.value
    .slice()
    .sort((a, b) => a.locale.localeCompare(b.locale))
    .map((v) => ({
      value: v.shortName,
      label: `${v.shortName.replace(/Neural$/, '')} · ${v.locale} · ${v.gender === 'Female' ? '女' : '男'}`
    }))
)

// ---------- OCR 規則0 ----------
const baiduComplete = computed(
  () => !!(cfg.ocr.providers.baidu.apiKey && cfg.ocr.providers.baidu.secretKey)
)
const tencentComplete = computed(() => {
  const t = cfg.ocr.providers.tencent
  if (t.reuseTmt) {
    return !!(cfg.translate.providers.tmt.secretId && cfg.translate.providers.tmt.secretKey)
  }
  return !!(t.secretId && t.secretKey)
})
function selectOcr(engine: 'baidu' | 'tencent'): void {
  if (engine === 'baidu' && !baiduComplete.value) return
  if (engine === 'tencent' && !tencentComplete.value) return
  cfg.ocr.active = engine
  saveOcr()
}
// const tencentTestConfig = computed(() => {
//   const t = cfg.ocr.providers.tencent
//   if (t.reuseTmt) {
//     return {
//       secretId: cfg.translate.providers.tmt.secretId,
//       secretKey: cfg.translate.providers.tmt.secretKey,
//       region: t.region
//     }
//   }
//   return { secretId: t.secretId, secretKey: t.secretKey, region: t.region }
// })
const baiduTestConfig = computed(() => ({
  apiKey: cfg.ocr.providers.baidu.apiKey,
  secretKey: cfg.ocr.providers.baidu.secretKey
}))

// TTS 折叠
const ttsCollapsed = ref(false)

// 密钥区折叠：已填好的默认收起；用户手动操作或编辑后不再自动收起
const baiduCollapsed = ref(false)
let baiduAuto = true
watch(
  baiduComplete,
  (v) => {
    if (baiduAuto) baiduCollapsed.value = v
  },
  { immediate: true }
)
function toggleBaidu(): void {
  baiduAuto = false
  baiduCollapsed.value = !baiduCollapsed.value
}
function onBaiduKey(field: 'apiKey' | 'secretKey', val: string): void {
  baiduAuto = false
  cfg.ocr.providers.baidu[field] = val
}

function openExternal(url: string): void {
  void window.flash.openExternal(url)
}

// ---------- 窗口控制（自定义标题栏）----------
function winMinimize(): void {
  void window.flash.winMinimize()
}
function winMaximize(): void {
  void window.flash.winMaximizeToggle()
}
function winClose(): void {
  void window.flash.winClose()
}
</script>

<template>
  <div class="settings">
    <header class="titlebar">
      <div class="tb-drag">
        <span class="tb-logo"><Icon name="settings" :size="14" /></span>
        <span class="tb-title">FlashLate 设置</span>
      </div>
      <div class="win-controls">
        <button class="win-btn" aria-label="最小化" @click="winMinimize">
          <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
            <rect x="1.5" y="5" width="8" height="1.1" fill="currentColor" />
          </svg>
        </button>
        <button class="win-btn" aria-label="最大化" @click="winMaximize">
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
            <rect
              x="1.6"
              y="1.6"
              width="7.8"
              height="7.8"
              rx="1"
              stroke="currentColor"
              stroke-width="1.1"
            />
          </svg>
        </button>
        <button class="win-btn" aria-label="关闭" @click="winClose">
          <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
            <path
              d="M1.5 1.5l8 8M9.5 1.5l-8 8"
              stroke="currentColor"
              stroke-width="1.2"
              stroke-linecap="round"
            />
          </svg>
        </button>
      </div>
    </header>

    <nav class="settings-tabs">
      <button
        v-for="t in TABS"
        :key="t.id"
        class="settings-tab"
        :class="{ active: tab === t.id }"
        @click="tab = t.id"
      >
        <Icon :name="t.icon" :size="14" />
        {{ t.label }}
      </button>
    </nav>

    <main class="settings-body">
      <p v-if="!encryptionAvailable" class="enc-warn">
        <Icon name="alert" :size="13" />
        系统密钥库不可用，密钥将以明文存储于本地配置文件，请注意安全。
      </p>

      <!-- 通用 -->
      <section v-show="tab === 'general'" class="tab-panel">
        <div class="section">
          <h3 class="section-title">开机启动</h3>
          <div class="card">
            <div class="row">
              <label>开机自启</label>
              <Toggle v-model="cfg.general.autoLaunch" @update:model-value="saveGeneral" />
              <!-- <span class="row-hint">启用后每次开机自动后台运行</span> -->
            </div>
          </div>
        </div>

        <div class="section">
          <h3 class="section-title">全局快捷键</h3>
          <div class="card">
            <div class="row">
              <label>输入翻译</label>
              <HotkeyInput v-model="cfg.hotkeys.input" @commit="saveHotkey" />
              <span class="row-hint">唤起空输入框</span>
            </div>
            <p v-if="hotkeyConflict.input" class="conflict-msg">该快捷键已被占用，请更换</p>
            <div class="row">
              <label>划词翻译</label>
              <HotkeyInput v-model="cfg.hotkeys.selection" @commit="saveHotkey" />
              <span class="row-hint">提取选中文本</span>
            </div>
            <p v-if="hotkeyConflict.selection" class="conflict-msg">该快捷键已被占用，请更换</p>
            <div class="row">
              <label>截图翻译</label>
              <HotkeyInput v-model="cfg.hotkeys.ocr" @commit="saveHotkey" />
              <span class="row-hint">框选区域识别</span>
            </div>
            <p v-if="hotkeyConflict.ocr" class="conflict-msg">该快捷键已被占用，请更换</p>
          </div>
        </div>

        <div class="section">
          <h3 class="section-title">默认语种</h3>
          <div class="card">
            <div class="row">
              <label>源语言</label>
              <Select
                v-model="cfg.translate.sourceLang"
                :options="sourceOptions"
                aria-label="源语言"
                @update:model-value="saveLangs"
              />
            </div>
            <div class="row">
              <label>目标语言</label>
              <Select
                v-model="cfg.translate.targetLang"
                :options="targetOptions"
                aria-label="目标语言"
                @update:model-value="saveLangs"
              />
            </div>
          </div>
        </div>
      </section>

      <!-- 翻译 -->
      <section v-show="tab === 'translate'" class="tab-panel">
        <div class="section">
          <h3 class="section-title">翻译平台（可多选）</h3>
          <TranslateProvider
            id="local"
            name="免费翻译"
            hint="LibreTranslate · 中英互译 · 无需密钥"
            badge="free"
            :fields="[]"
            :config="cfg.translate.providers.local"
            @persist="saveTranslate"
          />
          <TranslateProvider
            id="tmt"
            name="腾讯 TMT"
            hint="500万字符/月"
            badge="key"
            :fields="[
              { key: 'secretId', label: 'SecretId' },
              { key: 'secretKey', label: 'SecretKey' }
            ]"
            :config="cfg.translate.providers.tmt"
            @persist="saveTranslate"
          />
          <TranslateProvider
            id="niu"
            name="小牛翻译"
            hint="20万字符/日"
            badge="key"
            :fields="[
              { key: 'appId', label: 'AppId' },
              { key: 'apiKey', label: 'ApiKey' }
            ]"
            :config="cfg.translate.providers.niu"
            @persist="saveTranslate"
          />
          <!-- <TranslateProvider
            id="glm"
            name="GLM-4.7-Flash"
            hint="备用 · 高峰期限流"
            badge="key"
            :fields="[{ key: 'apiKey', label: 'API Key' }]"
            :config="cfg.translate.providers.glm"
            @persist="saveTranslate"
          /> -->
        </div>
      </section>

      <!-- 发音 -->
      <section v-show="tab === 'tts'" class="tab-panel">
        <div class="section">
          <h3 class="section-title">发音引擎（单选）</h3>
          <div class="card engine-card" :class="{ collapsed: ttsCollapsed }">
            <div class="engine-head" @click="ttsCollapsed = !ttsCollapsed">
              <span class="engine-name">Edge TTS</span>
              <span class="engine-meta">322 嗓音 · 142 语种</span>
              <span class="badge badge-free">免费</span>
              <button
                class="engine-chevron"
                aria-label="展开或收起"
                :aria-expanded="!ttsCollapsed"
                @click.stop="ttsCollapsed = !ttsCollapsed"
              >
                <Icon name="chevronDown" :size="16" />
              </button>
            </div>
            <div class="engine-body">
              <div class="engine-body-inner">
                <div class="card-divider"></div>
                <div class="row">
                  <label>嗓音</label>
                  <Select
                    v-model="cfg.tts.voice"
                    :options="voiceOptions"
                    aria-label="嗓音"
                    @update:model-value="saveTts"
                  />
                </div>
                <TestButton id="edge" kind="tts" :config="ttsTestConfig" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- OCR -->
      <section v-show="tab === 'ocr'" class="tab-panel">
        <div class="section">
          <h3 class="section-title">OCR 引擎（单选，密钥不全不可选中）</h3>

          <div
            class="ocr-engine"
            :class="{ selected: cfg.ocr.active === 'baidu', collapsed: baiduCollapsed }"
          >
            <div
              class="ocr-head"
              :class="{ selected: cfg.ocr.active === 'baidu', disabled: !baiduComplete }"
              role="button"
              :aria-expanded="!baiduCollapsed"
              @click="toggleBaidu"
            >
              <input
                type="radio"
                :checked="cfg.ocr.active === 'baidu'"
                :disabled="!baiduComplete"
                @click.stop
                @change="selectOcr('baidu')"
              />
              <span class="ocr-name">百度 OCR</span>
              <span class="ocr-quota">1000 次/月</span>
              <span class="ocr-spacer"></span>
              <span class="badge badge-key">需 Key</span>
              <button
                class="engine-chevron"
                aria-label="展开或收起密钥"
                :aria-expanded="!baiduCollapsed"
                @click.stop="toggleBaidu"
              >
                <Icon name="chevronDown" :size="16" />
              </button>
            </div>
            <div class="engine-body">
              <div class="engine-body-inner">
                <KeyInput
                  :model-value="cfg.ocr.providers.baidu.apiKey"
                  label="API Key"
                  placeholder="百度 API Key"
                  @update:model-value="onBaiduKey('apiKey', $event)"
                  @commit="saveOcr"
                />
                <KeyInput
                  :model-value="cfg.ocr.providers.baidu.secretKey"
                  label="Secret Key"
                  placeholder="百度 Secret Key"
                  @update:model-value="onBaiduKey('secretKey', $event)"
                  @commit="saveOcr"
                />
                <TestButton
                  id="baidu"
                  kind="ocr"
                  :config="baiduTestConfig"
                  :disabled="!baiduComplete"
                />
              </div>
            </div>
          </div>

          <!-- <div class="ocr-engine" :class="{ selected: cfg.ocr.active === 'tencent' }">
            <div
              class="radio-row"
              :class="{ selected: cfg.ocr.active === 'tencent', disabled: !tencentComplete }"
              @click="selectOcr('tencent')"
            >
              <input
                type="radio"
                :checked="cfg.ocr.active === 'tencent'"
                :disabled="!tencentComplete"
              />
              <span class="radio-desc"><b>腾讯图片翻译</b> · ImageTranslateLLM</span>
              <span class="badge badge-free">1 万次/月</span>
            </div>
            <label class="reuse-row">
              <input
                type="checkbox"
                v-model="cfg.ocr.providers.tencent.reuseTmt"
                @change="saveOcr"
              />
              复用「翻译 → 腾讯 TMT」的密钥（推荐，无需重复填写）
            </label>
            <template v-if="!cfg.ocr.providers.tencent.reuseTmt">
              <KeyInput
                v-model="cfg.ocr.providers.tencent.secretId"
                label="SecretId"
                placeholder="腾讯云 SecretId"
                @commit="saveOcr"
              />
              <KeyInput
                v-model="cfg.ocr.providers.tencent.secretKey"
                label="SecretKey"
                placeholder="腾讯云 SecretKey"
                @commit="saveOcr"
              />
            </template>
            <TestButton
              kind="ocr"
              id="tencent"
              :config="tencentTestConfig"
              :disabled="!tencentComplete"
            />
          </div> -->
        </div>
      </section>

      <!-- 关于 -->
      <section v-show="tab === 'about'" class="tab-panel">
        <div class="section">
          <h3 class="section-title">FlashLate 闪译</h3>
          <div class="card">
            <div class="row">
              <label>版本</label><span class="mono">v{{ appVersion }}</span>
            </div>
            <div class="row">
              <label>更新</label>
              <div class="update-controls">
                <button class="btn-ghost" :disabled="updateCheckDisabled" @click="checkUpdate">
                  检查更新
                </button>
                <button
                  v-if="updateActionLabel"
                  class="btn-primary update-action"
                  :class="{ 'is-progress': updateState === 'downloading' }"
                  :disabled="updateActionDisabled"
                  @click="updatePrimary"
                >
                  {{ updateActionLabel }}
                </button>
                <span v-if="updateTip" class="row-hint">
                  {{ updateTip }}
                </span>
              </div>
            </div>
          </div>
        </div>
        <div class="section">
          <h3 class="section-title">申请密钥</h3>
          <div class="card links">
            <a @click="openExternal('https://console.cloud.tencent.com/cam/capi')">
              <span>申请腾讯云密钥</span>
              <Icon name="arrowRight" :size="14" />
            </a>
            <a @click="openExternal('https://console.bce.baidu.com/ai-engine/ocr/overview/index')">
              <span>申请百度 OCR 密钥</span>
              <Icon name="arrowRight" :size="14" />
            </a>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.settings {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--c-bg);
}

/* ---------- 标题栏 ---------- */
.titlebar {
  display: flex;
  align-items: stretch;
  height: 44px;
  border-bottom: 1px solid var(--c-border);
  flex-shrink: 0;
  -webkit-app-region: drag;
}
.tb-drag {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 0 14px;
  color: var(--c-text);
  font-weight: 600;
  font-size: 13px;
}
.tb-logo {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 7px;
  background: var(--c-primary-light);
  color: var(--c-primary);
}
.tb-title {
  letter-spacing: 0.2px;
}
.win-controls {
  display: flex;
  -webkit-app-region: no-drag;
}
.win-btn {
  width: 44px;
  border: none;
  background: transparent;
  color: var(--c-text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    background 0.15s,
    color 0.15s;
}
.win-btn:hover {
  background: var(--c-bg-hover);
  color: var(--c-text);
}
.win-btn.close:hover {
  background: var(--c-error);
  color: #fff;
}

/* ---------- 标签页 ---------- */
.settings-tabs {
  display: flex;
  gap: 2px;
  padding: 0 10px;
  border-bottom: 1px solid var(--c-border);
  background: var(--c-bg);
  flex-shrink: 0;
}
.settings-tab {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 11px 13px;
  border: none;
  background: none;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--c-text-secondary);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition:
    color 0.15s,
    border-color 0.15s;
}
.settings-tab:hover {
  color: var(--c-text);
}
.settings-tab.active {
  color: var(--c-primary);
  border-bottom-color: var(--c-primary);
}
.settings-tab:focus-visible {
  outline: 2px solid var(--c-primary);
  outline-offset: -2px;
  border-radius: var(--radius-sm);
}

/* ---------- 内容区：浅灰底 + 浮起白卡片 ---------- */
.settings-body {
  flex: 1;
  overflow-y: auto;
  padding: 18px;
  background: var(--c-bg-subtle);
}
.settings-body::-webkit-scrollbar {
  width: 9px;
}
.settings-body::-webkit-scrollbar-thumb {
  background: var(--c-border-strong);
  border-radius: 5px;
  border: 2px solid var(--c-bg-subtle);
}
.enc-warn {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
  color: #92400e;
  background: var(--c-warn-light);
  border: 1px solid #fcd9a3;
  padding: 9px 11px;
  border-radius: var(--radius-md);
  margin-bottom: 20px;
}
.tab-panel {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.section-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--c-text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.6px;
  margin: 0 0 10px 0;
}

/* 白卡片：发丝边框 + 分层柔阴影 */
.card {
  background: var(--c-bg);
  border: 1px solid var(--c-border);
  border-radius: var(--radius-md);
  box-shadow: var(--c-shadow-card);
  padding: 12px 16px;
}
.card-divider {
  height: 1px;
  background: var(--c-border);
  margin: 6px -16px;
}

.row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  font-size: 13px;
}
.row label:not(.toggle) {
  flex: 0 0 76px;
  font-weight: 500;
}
.row-hint {
  font-size: 11px;
  color: var(--c-text-tertiary);
}
.conflict-msg {
  font-size: 11px;
  color: var(--c-error);
  padding: 0 0 4px 86px;
  margin-top: -8px;
}

/* 发音引擎头 */
/* 发音卡：对齐翻译/OCR 卡的内边距与节奏 */
.engine-card {
  padding: 12px 16px;
}
.engine-card .card-divider {
  margin: 6px -16px;
}
.engine-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  cursor: pointer;
  user-select: none;
}
.engine-name {
  font-weight: 600;
}
.engine-meta {
  flex: 1;
  font-size: 11px;
  color: var(--c-text-tertiary);
}

/* Badge：与 TranslateProvider 的 badge-free / badge-key 视觉统一 */
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

/* OCR 引擎卡片（浮起，内部单选行无边框） */
.ocr-engine {
  background: var(--c-bg);
  padding: 12px 16px;
  border: 1px solid var(--c-border);
  border-radius: var(--radius-md);
  box-shadow: var(--c-shadow-card);
  transition: border-color 0.15s;
}
.ocr-engine + .ocr-engine {
  margin-top: 12px;
}
.ocr-engine .ocr-head {
  border: none;
  padding: 0 0 4px;
}
.ocr-engine.selected {
  border-color: var(--c-primary);
  box-shadow:
    0 0 0 3px var(--c-primary-ring),
    var(--c-shadow-card);
}
/* OCR 卡片头：与 TranslateProvider 的 provider-head 视觉对齐 */
.ocr-head {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
}
.ocr-head.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.ocr-head input[type='radio'] {
  accent-color: var(--c-primary);
}
.ocr-name {
  font-weight: 600;
  font-size: 13px;
}
.ocr-quota {
  font-size: 11px;
  color: var(--c-text-tertiary);
}
.ocr-spacer {
  flex: 1;
}
.engine-chevron {
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
.engine-chevron :deep(svg) {
  transition: transform 0.2s ease;
}
.engine-chevron:hover {
  background: var(--c-bg-hover);
  color: var(--c-text);
}
.ocr-engine.collapsed .engine-chevron :deep(svg),
.engine-card.collapsed .engine-chevron :deep(svg) {
  transform: rotate(-90deg);
}
.engine-body {
  display: grid;
  grid-template-rows: 1fr;
  transition: grid-template-rows 0.25s ease;
}
.ocr-engine.collapsed .engine-body,
.engine-card.collapsed .engine-body {
  grid-template-rows: 0fr;
}
.engine-body-inner {
  overflow: hidden;
  min-height: 0;
}
.reuse-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--c-text-secondary);
  margin-top: 8px;
  cursor: pointer;
}
.reuse-row input {
  accent-color: var(--c-primary);
}

/* 关于 */
.mono {
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--c-text-secondary);
}
.about-desc {
  font-size: 12px;
  line-height: 1.7;
  color: var(--c-text-secondary);
  padding: 2px 0 8px;
}
.links a {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 0;
  font-size: 13px;
  font-weight: 500;
  color: var(--c-text);
  cursor: pointer;
  transition: color 0.15s;
}
.links a + a {
  border-top: 1px solid var(--c-border);
}
.links a:hover {
  color: var(--c-primary);
}
.links a :deep(svg) {
  color: var(--c-text-tertiary);
  transition:
    color 0.15s,
    transform 0.15s;
}
.links a:hover :deep(svg) {
  color: var(--c-primary);
  transform: translateX(2px);
}

/* 更新 */
.update-actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

/* 更新控制区域 */
.update-controls {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
}
.btn-ghost,
.btn-primary {
  height: 30px;
  padding: 0 14px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition:
    background 0.15s,
    color 0.15s,
    opacity 0.15s;
}
.btn-ghost {
  border: 1px solid var(--c-border);
  background: transparent;
  color: var(--c-text);
}
.btn-ghost:hover:not(:disabled) {
  background: var(--c-bg-hover);
}
.btn-ghost:disabled {
  opacity: 0.5;
  cursor: default;
}
.btn-primary {
  border: 1px solid var(--c-primary);
  background: var(--c-primary);
  color: #fff;
}
.btn-primary:hover:not(:disabled) {
  opacity: 0.9;
}
.btn-primary:disabled {
  cursor: default;
}
/* 下载中：禁用视觉柔和化，文案「正在下载 X%」原生承载进度 */
.btn-primary.update-action.is-progress {
  background: var(--c-primary-light);
  color: var(--c-primary);
  border-color: transparent;
  cursor: progress;
}
</style>
