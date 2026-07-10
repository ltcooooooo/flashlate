// 设置窗：普通窗口，懒加载，关闭即 destroy 回收内存。

import { BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { CH } from '../../shared/channels'
import type { SettingsSection } from '../../shared/types'

let win: BrowserWindow | null = null

/** 最近一次 openSettings(section) 传入但尚未被 renderer 读取的目标板块。
 *  解决「窗口首次创建时 ready-to-show 早于 Vue onMounted 注册监听」的 race。 */
let pendingSection: SettingsSection | null = null

/** 渲染层挂载后调用：被动取出 pendingSection 同时清空，避免重复跳板 */
export function consumePendingSection(): SettingsSection | null {
  const v = pendingSection
  pendingSection = null
  return v
}

export function openSettings(section?: SettingsSection): void {
  // 已存在窗口分支：直接 live SETTINGS_NAVIGATE，不写 pending（避免被未消费就污染）
  if (win && !win.isDestroyed()) {
    win.show()
    win.focus()
    if (section) win.webContents.send(CH.SETTINGS_NAVIGATE, section)
    return
  }
  // 全新创建路径：仅在此处缓存 section，供 renderer onMounted 后消费
  if (section) pendingSection = section
  win = new BrowserWindow({
    width: 560,
    height: 640,
    show: false,
    title: 'FlashLate 设置',
    frame: false,
    backgroundColor: '#ffffff',
    autoHideMenuBar: true,
    resizable: true,
    minWidth: 480,
    minHeight: 520,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.on('ready-to-show', () => {
    win?.show()
    // 兜底推送：若渲染层 onMounted 已在 ready-to-show 之前注册，此处仍能命中
    if (section) win?.webContents.send(CH.SETTINGS_NAVIGATE, section)
  })
  win.on('closed', () => {
    win = null
    // 防止「窗口秒关 + 下次无 section 开启」导致 pendingSection 偷渡
    pendingSection = null
  })

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/settings.html`)
  } else {
    win.loadFile(join(__dirname, '../renderer/settings.html'))
  }
}

export function getSettings(): BrowserWindow | null {
  return win
}
