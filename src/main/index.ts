import { app, ipcMain, screen } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { CH } from '../shared/channels'
import { getConfig, initState } from './state'
import { createPopup, fillPopup, getPopup } from './windows/popup'
import { buildOverlayPool, destroyOverlayPool, handleRegion } from './windows/overlay'
import { createTray, rebuildMenu } from './tray'
import { registerHotkeys, unregisterAll, HotkeyAction } from './hotkeys'
import { registerIpc, broadcastConfigChanged } from './ipc'
import { verifyAutoLaunchOnStartup } from './services/autolaunch'
import { captureSelection } from './services/selection'
import { captureAndOcr } from './services/capture'
import { registerUpdater, checkForUpdates } from './services/updater'

// ── 命令行开关：必须在 app ready 之前设置，否则不生效 ──
// 禁用窗口管理器的窗口动画：透明无边框弹窗在 show() 时会有淡入/缩放动画，
// 导致首帧透明背景闪烁。关掉后弹窗"跟手"出现且无闪烁（已实测可行）。
app.commandLine.appendSwitch('wm-window-animations-disabled')

// 单实例锁：第二个实例直接退出（全局工具应常驻单例）
if (!app.requestSingleInstanceLock()) {
  app.quit()
}

// 热键触发分发
async function onHotkey(action: HotkeyAction): Promise<void> {
  if (action === 'input') {
    // 唤起空输入框并聚焦
    fillPopup({ text: '', trigger: 'input', empty: true })
    getPopup()?.webContents.send(CH.POPUP_FOCUS_INPUT)
    return
  }
  if (action === 'selection') {
    const text = await captureSelection()
    if (text) {
      fillPopup({ text, trigger: 'selection' })
    } else {
      // 未取到词 → 唤起空输入框（PRD 分支）
      fillPopup({ text: '', trigger: 'selection', empty: true })
      getPopup()?.webContents.send(CH.POPUP_FOCUS_INPUT)
    }
    return
  }
  if (action === 'ocr') {
    await captureAndOcr()
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.flashlate.app')

  // 必须先加载配置（safeStorage 解密需 app ready），再注册依赖配置的热键等
  initState()

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // 预创建隐藏弹窗（<300ms 关键）
  createPopup()
  // 截图遮罩窗口池
  buildOverlayPool()
  screen.on('display-added', buildOverlayPool)
  screen.on('display-removed', buildOverlayPool)

  // 托盘
  createTray()

  // IPC
  registerIpc((action) => void onHotkey(action))
  ipcMain.on('region', (e, rect) => handleRegion(e.sender, rect))

  // 更新服务：注册事件 + 启动后静默检查；更新状态由 popup 下载图标 / 设置 → 关于承载
  registerUpdater()
  setTimeout(() => checkForUpdates(), 3000)

  // 启动时以系统真实状态为准修正自启配置（用户在系统设置中手动关闭的不应被复活）
  void verifyAutoLaunchOnStartup().then((modified) => {
    if (modified) {
      broadcastConfigChanged()
      rebuildMenu()
    }
  })

  // 注册热键
  registerHotkeys(getConfig().hotkeys, (action) => void onHotkey(action))

  // 第二实例唤起：打开设置
  app.on('second-instance', () => {
    import('./windows/settings').then((m) => m.openSettings())
  })
})

// 工具常驻：关掉所有窗口不退出（靠托盘退出）
app.on('window-all-closed', () => {
  // 不退出
})

app.on('will-quit', () => {
  unregisterAll()
  destroyOverlayPool()
})

// 安全：阻止 webview 附加
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-attach-webview', (event) => event.preventDefault())
})
