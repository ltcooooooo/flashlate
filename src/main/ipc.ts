// 所有 ipcMain 处理器集中注册。主进程把渲染层视为不可信，校验输入。

import { ipcMain, clipboard, BrowserWindow, shell, app } from 'electron'
import { CH } from '../shared/channels'
import type {
  Hotkeys,
  GeneralConfig,
  ProviderKind,
  TtsConfig,
  TranslateConfig,
  OcrConfig
} from '../shared/types'
import { getConfig, updateConfig, orchestrator, ocrService } from './state'
import { getPopup, setPinned, resizePopup, hidePopup, forceHidePopup } from './windows/popup'
import { openSettings, consumePendingSection } from './windows/settings'
import { registerHotkeys, validateAccelerator, setPaused, HotkeyAction } from './hotkeys'
import { listVoices, synthesize } from './services/tts/edge'
import { isEncryptionAvailable } from './config/store'
import { setAutoLaunch } from './services/autolaunch'
import {
  checkForUpdates,
  startDownload,
  quitAndInstall,
  getLastStatus
} from './services/updater'
import type { SettingsSection } from '../shared/types'

type TriggerFn = (action: HotkeyAction) => void

// 配置变更订阅：tray 等同进程模块可监听 store 修改（用于重建托盘菜单等场景）。
// 使用回调而非 ipc ↔ tray 互相 import，避免循环依赖。
const configChangeListeners = new Set<() => void>()

/** 注册配置变更回调，返回反订阅函数 */
export function onConfigChange(cb: () => void): () => void {
  configChangeListeners.add(cb)
  return () => {
    configChangeListeners.delete(cb)
  }
}

/** 广播配置变更给所有窗口（弹窗据此刷新可用平台列表） */
export function broadcastConfigChanged(): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(CH.CONFIG_CHANGED)
  }
  for (const cb of configChangeListeners) {
    try {
      cb()
    } catch (e) {
      console.error('[config-change listener]', e)
    }
  }
}

/** 重新注册热键（配置变更后） */
function reRegisterHotkeys(onTrigger: TriggerFn): void {
  registerHotkeys(getConfig().hotkeys, onTrigger)
}

export function registerIpc(onTrigger: TriggerFn): void {
  // ---------- 配置读取 ----------
  // 设置窗作为可信配置编辑器，拿到含密钥的完整配置；附带 safeStorage 可用性
  ipcMain.handle(CH.CONFIG_GET, () => ({
    config: getConfig(),
    encryptionAvailable: isEncryptionAvailable()
  }))

  // 弹窗只拿"已启用且 Key 齐全"的平台清单
  ipcMain.handle(CH.GET_ENABLED_PROVIDERS, () => orchestrator.enabledProviders())

  // ---------- 配置写入（分区，避免整包覆盖竞争）----------
  ipcMain.handle(CH.CONFIG_SET_GENERAL, async (_e, general: GeneralConfig) => {
    const next = await setAutoLaunch(!!general?.autoLaunch)
    broadcastConfigChanged()
    return next
  })

  ipcMain.handle(CH.CONFIG_SET_HOTKEYS, (_e, hotkeys: Hotkeys) => {
    const cfg = { ...getConfig(), hotkeys }
    updateConfig(cfg)
    const result = registerHotkeys(hotkeys, onTrigger)
    return result // 返回各项注册结果（冲突检测）
  })

  ipcMain.handle(CH.CONFIG_SET_LANGS, (_e, langs: { sourceLang: string; targetLang: string }) => {
    const cfg = getConfig()
    updateConfig({
      ...cfg,
      translate: { ...cfg.translate, sourceLang: langs.sourceLang, targetLang: langs.targetLang }
    })
    broadcastConfigChanged()
  })

  ipcMain.handle(CH.CONFIG_SET_TRANSLATE_PROVIDER, (_e, translate: TranslateConfig) => {
    const cfg = getConfig()
    updateConfig({ ...cfg, translate: { ...cfg.translate, ...translate } })
    broadcastConfigChanged()
  })

  ipcMain.handle(CH.CONFIG_SET_TTS, (_e, tts: TtsConfig) => {
    updateConfig({ ...getConfig(), tts })
    broadcastConfigChanged()
  })

  ipcMain.handle(CH.CONFIG_SET_OCR, (_e, ocr: OcrConfig) => {
    updateConfig({ ...getConfig(), ocr })
    broadcastConfigChanged()
  })

  // ---------- 翻译 ----------
  ipcMain.handle(
    CH.TRANSLATE_RUN,
    (_e, payload: { text: string; source: string; target: string }) => {
      const popup = getPopup()
      if (!popup || popup.isDestroyed()) return
      const text = String(payload?.text ?? '').trim()
      if (!text) return
      orchestrator.run(
        (channel, data) => popup.webContents.send(channel, data),
        text,
        payload.source,
        payload.target
      )
    }
  )

  ipcMain.handle(CH.TRANSLATE_ABORT, () => orchestrator.abort())

  // ---------- Key 测试（手动测试按钮 / 自动启用前校验）----------
  ipcMain.handle(
    CH.PROVIDER_TEST,
    async (_e, payload: { kind: ProviderKind; id: string; config: Record<string, string> }) => {
      const { kind, id, config } = payload
      try {
        if (kind === 'translate') {
          const p = orchestrator.getProvider(id as 'local' | 'tmt' | 'glm' | 'niu')
          if (!p) return { ok: false, message: '未知平台' }
          return await p.verifyKey(config)
        }
        if (kind === 'ocr') {
          return await ocrService.verify(id as 'baidu' | 'tencent', config)
        }
        if (kind === 'tts') {
          // Edge TTS 无需 Key，能取到嗓音即可用
          await listVoices()
          return { ok: true, message: '可用（无需密钥）' }
        }
        return { ok: false, message: '未知类型' }
      } catch (e) {
        return { ok: false, message: e instanceof Error ? e.message : String(e) }
      }
    }
  )

  // ---------- 剪贴板 ----------
  ipcMain.handle(CH.CLIPBOARD_WRITE, (_e, payload: { text: string }) => {
    try {
      clipboard.writeText(String(payload?.text ?? ''))
      return { ok: true }
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) }
    }
  })

  // ---------- TTS ----------
  ipcMain.handle(CH.TTS_VOICES, async () => {
    try {
      return await listVoices()
    } catch {
      return []
    }
  })

  ipcMain.handle(CH.TTS_SPEAK, async (_e, payload: { text: string }) => {
    const text = String(payload?.text ?? '').trim()
    if (!text) return { ok: false, message: '无文本' }
    try {
      const voice = getConfig().tts.voice
      const audioBase64 = await synthesize(text, voice)
      return { ok: true, audioBase64 }
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) }
    }
  })

  // ---------- 热键校验 / 暂停 ----------
  ipcMain.handle(CH.HOTKEY_VALIDATE, (_e, payload: { accelerator: string }) => ({
    ok: validateAccelerator(String(payload?.accelerator ?? ''))
  }))

  ipcMain.handle(CH.HOTKEYS_PAUSE, (_e, payload: { paused: boolean }) => {
    setPaused(!!payload?.paused)
    reRegisterHotkeys(onTrigger)
  })

  // ---------- 弹窗控制 ----------
  ipcMain.handle(CH.POPUP_PIN, (_e, payload: { pinned: boolean }) => {
    setPinned(!!payload?.pinned)
  })
  ipcMain.handle(CH.POPUP_RESIZE, (_e, payload: { height: number }) => {
    resizePopup(Number(payload?.height ?? 0))
  })
  ipcMain.handle(CH.POPUP_HIDE, (_e, payload?: { force?: boolean }) => {
    if (payload?.force) {
      orchestrator.abort()
      forceHidePopup()
    } else {
      hidePopup()
    }
  })
  ipcMain.handle(CH.OPEN_SETTINGS, (_e, payload?: { section?: SettingsSection }) =>
    openSettings(payload?.section)
  )
  ipcMain.handle(CH.OPEN_EXTERNAL, (_e, payload: { url: string }) => {
    const url = String(payload?.url ?? '')
    if (/^https?:\/\//.test(url)) shell.openExternal(url)
  })

  // ---------- 应用更新 ----------
  ipcMain.handle(CH.UPDATE_CHECK, () => checkForUpdates())
  ipcMain.handle(CH.UPDATE_DOWNLOAD, () => startDownload())
  ipcMain.handle(CH.UPDATE_INSTALL, () => quitAndInstall())
  // 窗口挂载后回放：避免广播先于窗口 mount 导致的状态丢失
  ipcMain.handle(CH.UPDATE_GET_LAST, () => getLastStatus())
  // 设置窗挂载后：被动消费最近的 openSettings(section) 目标板块
  ipcMain.handle(CH.SETTINGS_GET_PENDING, () => consumePendingSection())

  // ---------- 应用信息 ----------
  ipcMain.handle(CH.GET_VERSION, () => app.getVersion())

  // ---------- 窗口控制（自定义标题栏，作用于发起窗口）----------
  ipcMain.handle(CH.WIN_MINIMIZE, (e) => {
    BrowserWindow.fromWebContents(e.sender)?.minimize()
  })
  ipcMain.handle(CH.WIN_MAXIMIZE_TOGGLE, (e) => {
    const w = BrowserWindow.fromWebContents(e.sender)
    if (!w) return false
    if (w.isMaximized()) {
      w.unmaximize()
      return false
    }
    w.maximize()
    return true
  })
  ipcMain.handle(CH.WIN_CLOSE, (e) => {
    BrowserWindow.fromWebContents(e.sender)?.close()
  })
}
