import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import { CH } from '../shared/channels'
import type {
  AppConfig,
  Hotkeys,
  EnabledProvider,
  GeneralConfig,
  TranslateConfig,
  TtsConfig,
  OcrConfig,
  ProviderKind,
  VerifyResult,
  TtsVoice,
  SettingsSection,
  UpdateStatus
} from '../shared/types'

// 主进程 → 渲染层 的订阅通道白名单
const RECEIVE = new Set<string>([
  CH.POPUP_FILL,
  CH.POPUP_FOCUS_INPUT,
  CH.PANEL_LOADING,
  CH.PANEL_SUCCESS,
  CH.PANEL_ERROR,
  CH.CONFIG_CHANGED,
  CH.OCR_STATUS,
  CH.POPUP_HIDDEN,
  CH.UPDATE_STATUS,
  CH.SETTINGS_NAVIGATE
])

function on(channel: string, cb: (...args: unknown[]) => void): () => void {
  if (!RECEIVE.has(channel)) return () => {}
  const listener = (_e: IpcRendererEvent, ...args: unknown[]): void => cb(...args)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api = {
  // ---- 配置 ----
  getConfig: (): Promise<{ config: AppConfig; encryptionAvailable: boolean }> =>
    ipcRenderer.invoke(CH.CONFIG_GET),
  getEnabledProviders: (): Promise<EnabledProvider[]> =>
    ipcRenderer.invoke(CH.GET_ENABLED_PROVIDERS),
  setGeneral: (general: GeneralConfig): Promise<GeneralConfig> =>
    ipcRenderer.invoke(CH.CONFIG_SET_GENERAL, general),
  setHotkeys: (hotkeys: Hotkeys): Promise<Record<string, boolean>> =>
    ipcRenderer.invoke(CH.CONFIG_SET_HOTKEYS, hotkeys),
  setLangs: (langs: { sourceLang: string; targetLang: string }): Promise<void> =>
    ipcRenderer.invoke(CH.CONFIG_SET_LANGS, langs),
  setTranslateProviders: (translate: TranslateConfig): Promise<void> =>
    ipcRenderer.invoke(CH.CONFIG_SET_TRANSLATE_PROVIDER, translate),
  setTts: (tts: TtsConfig): Promise<void> => ipcRenderer.invoke(CH.CONFIG_SET_TTS, tts),
  setOcr: (ocr: OcrConfig): Promise<void> => ipcRenderer.invoke(CH.CONFIG_SET_OCR, ocr),

  // ---- 翻译 ----
  translate: (payload: { text: string; source: string; target: string }): Promise<void> =>
    ipcRenderer.invoke(CH.TRANSLATE_RUN, payload),
  abortTranslate: (): Promise<void> => ipcRenderer.invoke(CH.TRANSLATE_ABORT),

  // ---- Key 测试 ----
  testProvider: (payload: {
    kind: ProviderKind
    id: string
    config: Record<string, string>
  }): Promise<VerifyResult> => ipcRenderer.invoke(CH.PROVIDER_TEST, payload),

  // ---- 剪贴板 / TTS ----
  copy: (text: string): Promise<{ ok: boolean; message?: string }> =>
    ipcRenderer.invoke(CH.CLIPBOARD_WRITE, { text }),
  speak: (text: string): Promise<{ ok: boolean; audioBase64?: string; message?: string }> =>
    ipcRenderer.invoke(CH.TTS_SPEAK, { text }),
  getVoices: (): Promise<TtsVoice[]> => ipcRenderer.invoke(CH.TTS_VOICES),

  // ---- 热键 ----
  validateHotkey: (accelerator: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke(CH.HOTKEY_VALIDATE, { accelerator }),
  pauseHotkeys: (paused: boolean): Promise<void> =>
    ipcRenderer.invoke(CH.HOTKEYS_PAUSE, { paused }),

  // ---- 弹窗控制 ----
  setPin: (pinned: boolean): Promise<void> => ipcRenderer.invoke(CH.POPUP_PIN, { pinned }),
  resizePopup: (height: number): Promise<void> => ipcRenderer.invoke(CH.POPUP_RESIZE, { height }),
  hidePopup: (force?: boolean): Promise<void> => ipcRenderer.invoke(CH.POPUP_HIDE, { force }),
  openSettings: (section?: SettingsSection): Promise<void> =>
    ipcRenderer.invoke(CH.OPEN_SETTINGS, { section }),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke(CH.OPEN_EXTERNAL, { url }),

  // ---- 应用更新 ----
  checkUpdate: (): Promise<void> => ipcRenderer.invoke(CH.UPDATE_CHECK),
  downloadUpdate: (): Promise<void> => ipcRenderer.invoke(CH.UPDATE_DOWNLOAD),
  installUpdate: (): Promise<void> => ipcRenderer.invoke(CH.UPDATE_INSTALL),
  getUpdateStatus: (): Promise<UpdateStatus | null> => ipcRenderer.invoke(CH.UPDATE_GET_LAST),
  getSettingsSection: (): Promise<SettingsSection | null> =>
    ipcRenderer.invoke(CH.SETTINGS_GET_PENDING),

  // ---- 窗口控制 ----
  winMinimize: (): Promise<void> => ipcRenderer.invoke(CH.WIN_MINIMIZE),
  winMaximizeToggle: (): Promise<boolean> => ipcRenderer.invoke(CH.WIN_MAXIMIZE_TOGGLE),
  winClose: (): Promise<void> => ipcRenderer.invoke(CH.WIN_CLOSE),

  // ---- 应用信息 ----
  getVersion: (): Promise<string> => ipcRenderer.invoke(CH.GET_VERSION),

  // ---- overlay（截图遮罩用）----
  sendRegion: (rect: { x: number; y: number; width: number; height: number } | null): void =>
    ipcRenderer.send('region', rect),

  // ---- 订阅 ----
  on
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('flash', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore define in dts
  window.flash = api
}

export type FlashApi = typeof api
