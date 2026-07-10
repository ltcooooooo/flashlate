// IPC 通道名常量，preload 白名单与主进程 handler 共用，避免拼写漂移。

export const CH = {
  // 渲染层 → 主进程（invoke，请求/响应）
  CONFIG_GET: 'config:get',
  CONFIG_SET_GENERAL: 'config:set-general',
  CONFIG_SET_HOTKEYS: 'config:set-hotkeys',
  CONFIG_SET_LANGS: 'config:set-langs',
  CONFIG_SET_TRANSLATE_PROVIDER: 'config:set-translate-provider',
  CONFIG_SET_TTS: 'config:set-tts',
  CONFIG_SET_OCR: 'config:set-ocr',
  GET_ENABLED_PROVIDERS: 'translate:enabled-providers',

  TRANSLATE_RUN: 'translate:run', // { text, source, target }
  TRANSLATE_ABORT: 'translate:abort',

  PROVIDER_TEST: 'provider:test', // 手动测试 Key { kind, id, draftConfig }

  CLIPBOARD_WRITE: 'clipboard:write', // { text } → { ok }
  TTS_SPEAK: 'tts:speak', // { text } → { ok, audioBase64 } | { ok:false }
  TTS_VOICES: 'tts:voices', // → TtsVoice[]

  HOTKEY_VALIDATE: 'hotkey:validate', // { accelerator } → { ok }
  HOTKEYS_PAUSE: 'hotkeys:pause', // { paused }

  POPUP_PIN: 'popup:pin', // { pinned }
  POPUP_RESIZE: 'popup:resize', // { height }
  POPUP_HIDE: 'popup:hide',
  OPEN_SETTINGS: 'settings:open', // { section? } —— 可选定位板块
  OPEN_EXTERNAL: 'shell:open-external', // { url }

  // 应用更新（渲染层 → 主进程）
  UPDATE_CHECK: 'update:check', // 手动检查更新
  UPDATE_DOWNLOAD: 'update:download', // 开始下载（仅 Windows）
  UPDATE_INSTALL: 'update:quit-and-install', // 重启安装（仅 Windows）
  UPDATE_GET_LAST: 'update:get-last', // 取最近一次状态（窗口挂载后回放）
  // 应用信息
  GET_VERSION: 'app:get-version',

  SETTINGS_GET_PENDING: 'settings:get-pending', // 取最近 openSettings(section) 的目标板块

  // 窗口控制（自定义标题栏）—— 作用于发起消息的窗口
  WIN_MINIMIZE: 'win:minimize',
  WIN_MAXIMIZE_TOGGLE: 'win:maximize-toggle',
  WIN_CLOSE: 'win:close',

  // 主进程 → 渲染层（webContents.send，订阅）
  POPUP_FILL: 'popup:fill', // PopupFill
  POPUP_FOCUS_INPUT: 'popup:focus-input',
  PANEL_LOADING: 'panel:loading', // TranslatePanelLoading
  PANEL_SUCCESS: 'panel:success', // TranslatePanelSuccess
  PANEL_ERROR: 'panel:error', // TranslatePanelError
  CONFIG_CHANGED: 'config:changed', // 设置变更广播给弹窗（刷新可用平台）
  OCR_STATUS: 'ocr:status', // { state: 'recognizing'|'error', message? }
  POPUP_HIDDEN: 'popup:hidden', // 弹窗隐藏（停止正在播放的发音等）
  UPDATE_STATUS: 'update:status', // UpdateStatus —— 更新状态广播
  SETTINGS_NAVIGATE: 'settings:navigate' // SettingsSection —— 设置窗定位板块
} as const

export type SendChannel =
  | typeof CH.CONFIG_GET
  | typeof CH.CONFIG_SET_GENERAL
  | typeof CH.CONFIG_SET_HOTKEYS
  | typeof CH.CONFIG_SET_LANGS
  | typeof CH.CONFIG_SET_TRANSLATE_PROVIDER
  | typeof CH.CONFIG_SET_TTS
  | typeof CH.CONFIG_SET_OCR
  | typeof CH.GET_ENABLED_PROVIDERS
  | typeof CH.TRANSLATE_RUN
  | typeof CH.TRANSLATE_ABORT
  | typeof CH.PROVIDER_TEST
  | typeof CH.CLIPBOARD_WRITE
  | typeof CH.TTS_SPEAK
  | typeof CH.TTS_VOICES
  | typeof CH.HOTKEY_VALIDATE
  | typeof CH.HOTKEYS_PAUSE
  | typeof CH.POPUP_PIN
  | typeof CH.POPUP_RESIZE
  | typeof CH.POPUP_HIDE
  | typeof CH.OPEN_SETTINGS
  | typeof CH.OPEN_EXTERNAL
  | typeof CH.UPDATE_CHECK
  | typeof CH.UPDATE_DOWNLOAD
  | typeof CH.UPDATE_INSTALL
  | typeof CH.UPDATE_GET_LAST
  | typeof CH.SETTINGS_GET_PENDING
  | typeof CH.WIN_MINIMIZE
  | typeof CH.WIN_MAXIMIZE_TOGGLE
  | typeof CH.WIN_CLOSE

export type ReceiveChannel =
  | typeof CH.POPUP_FILL
  | typeof CH.POPUP_FOCUS_INPUT
  | typeof CH.PANEL_LOADING
  | typeof CH.PANEL_SUCCESS
  | typeof CH.PANEL_ERROR
  | typeof CH.CONFIG_CHANGED
  | typeof CH.OCR_STATUS
  | typeof CH.POPUP_HIDDEN
  | typeof CH.UPDATE_STATUS
  | typeof CH.SETTINGS_NAVIGATE
