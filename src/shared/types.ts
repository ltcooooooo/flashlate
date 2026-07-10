// 跨进程共享的类型定义（仅类型，无可执行代码）。

// ---------- 配置 ----------
export interface Hotkeys {
  input: string // 输入翻译
  selection: string // 划词翻译
  ocr: string // 截图 OCR
}

/** 翻译平台配置：tmt 用 secretId/secretKey，glm 用 apiKey */
export interface TmtProviderConfig {
  enabled: boolean
  secretId: string
  secretKey: string
  region: string
}
export interface GlmProviderConfig {
  enabled: boolean
  apiKey: string
}
/** 小牛翻译：appId + apiKey（参与 MD5 签名） */
export interface NiuProviderConfig {
  enabled: boolean
  appId: string
  apiKey: string
}
/** 本地 LibreTranslate：只需启用开关，无需密钥 */
export interface LocalProviderConfig {
  enabled: boolean
}

export interface TranslateConfig {
  sourceLang: string
  targetLang: string
  providers: {
    local: LocalProviderConfig
    tmt: TmtProviderConfig
    glm: GlmProviderConfig
    niu: NiuProviderConfig
  }
}

export interface TtsConfig {
  active: 'edge' // MVP 仅 edge，单选
  voice: string // 如 en-US-AriaNeural
}

export interface BaiduOcrConfig {
  apiKey: string
  secretKey: string
}
export interface TencentOcrConfig {
  /** 复用 TMT 的腾讯云密钥（避免重复填） */
  reuseTmt: boolean
  secretId: string
  secretKey: string
  region: string
}
export interface OcrConfig {
  active: 'baidu' | 'tencent' // 单选
  providers: {
    baidu: BaiduOcrConfig
    tencent: TencentOcrConfig
  }
}

export interface GeneralConfig {
  /** 开机自启：依赖 OS / 桌面环境提供的开机启动机制 */
  autoLaunch: boolean
}

export interface AppConfig {
  general: GeneralConfig
  hotkeys: Hotkeys
  translate: TranslateConfig
  tts: TtsConfig
  ocr: OcrConfig
}

// ---------- 运行时（密钥脱敏，安全传给渲染层）----------
/** 弹窗用：当前已启用且 Key 齐全的翻译平台 */
export interface EnabledProvider {
  id: 'local' | 'tmt' | 'glm' | 'niu'
  name: string
}

// ---------- 翻译聚合 IPC 负载 ----------
export type TranslateTrigger = 'input' | 'selection' | 'ocr'

export interface TranslatePanelLoading {
  requestId: number
  providerId: string
}
export interface TranslatePanelSuccess {
  requestId: number
  providerId: string
  text: string
  /** 流式增量：true 表示这是逐字追加片段 */
  delta?: boolean
  detectedLang?: string
}
export interface TranslatePanelError {
  requestId: number
  providerId: string
  message: string
}

/** 主进程推给弹窗的"填充文本并触发翻译" */
export interface PopupFill {
  text: string
  trigger: TranslateTrigger
  /** 取词/OCR 为空时只唤起空输入框 */
  empty?: boolean
}

// ---------- Key 测试 ----------
export type ProviderKind = 'translate' | 'tts' | 'ocr'
export interface VerifyResult {
  ok: boolean
  message: string
  /** 耗时 ms */
  ms?: number
}

// ---------- TTS ----------
export interface TtsVoice {
  shortName: string
  locale: string
  gender: string
}

// ---------- 应用更新 ----------
/** 设置窗的板块（tab）标识，供 popup 图标跳转定位 */
export type SettingsSection = 'general' | 'translate' | 'tts' | 'ocr' | 'about'

/**
 * 更新状态（主进程 → 渲染层单通道广播）。
 * Windows 走 electron-updater 完整流程；Mac 仅比对版本，available 携带 releaseUrl 引导手动下载。
 */
export type UpdateStatus =
  | { state: 'checking' }
  | { state: 'available'; version: string; platform: 'win' | 'mac'; releaseUrl?: string }
  | { state: 'not-available' }
  | { state: 'downloading'; percent: number }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string }
