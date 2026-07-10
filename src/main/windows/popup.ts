// 翻译主弹窗：无边框/透明/置顶。启动即创建好但 hide()，唤起只 show()+定位（<300ms 关键）。
// 失焦自动 hide（未 Pin）。

import { BrowserWindow, screen, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { CH } from '../../shared/channels'
import type { PopupFill } from '../../shared/types'

const WIDTH = 452
const DEFAULT_HEIGHT = 240
const MAX_HEIGHT = 680
const TOP_RATIO = 0.2

let win: BrowserWindow | null = null
let pinned = false

export function createPopup(): BrowserWindow {
  win = new BrowserWindow({
    width: WIDTH,
    height: DEFAULT_HEIGHT,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    fullscreenable: false,
    maximizable: false,
    minimizable: false,
    hasShadow: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.setAlwaysOnTop(true, 'screen-saver')

  // 失焦自动隐藏（未 Pin）
  win.on('blur', () => {
    if (!pinned && win && win.isVisible()) win.hide()
  })

  // 隐藏时通知渲染层（停止正在播放的发音）。覆盖所有隐藏路径：失焦/ESC/划词复唤等。
  win.on('hide', () => {
    win?.webContents.send(CH.POPUP_HIDDEN)
  })

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/popup.html`)
  } else {
    win.loadFile(join(__dirname, '../renderer/popup.html'))
  }

  return win
}

export function getPopup(): BrowserWindow | null {
  return win
}

/** 唤起弹窗：定位到「当前活动屏」(鼠标所在屏) 水平居中、顶部距屏顶 30% 处 */
export function showPopup(): void {
  if (!win || win.isDestroyed()) return

  // 活动屏
  const cursor = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursor)
  const { x: ax, y: ay, width: aw, height: ah } = display.workArea

  const [w, h] = win.getSize()
  const x = ax + Math.round((aw - w) / 2) // 水平居中
  let y = ay + Math.round(ah * TOP_RATIO) // 顶部距屏顶 = 屏高 × TOP_RATIO

  // 底部溢出兜底
  if (y + h > ay + ah) y = ay + ah - h - 8
  if (y < ay) y = ay + 8

  win.setPosition(x, Math.round(y))
  win.show()
  win.focus()
}

/** 唤起 + 推送填充文本（划词/OCR/输入） */
export function fillPopup(payload: PopupFill): void {
  if (!win || win.isDestroyed()) return
  showPopup()
  win.webContents.send(CH.POPUP_FILL, payload)
}

export function setPinned(value: boolean): void {
  pinned = value
}

export function isPinned(): boolean {
  return pinned
}

export function hidePopup(): void {
  if (win && !win.isDestroyed() && !pinned) win.hide()
}

/** 强制隐藏（ESC 显式关闭，无视 Pin 状态；保留 pin 标志，下次唤起仍置顶） */
export function forceHidePopup(): void {
  if (win && !win.isDestroyed()) win.hide()
}

/** 渲染层内容高度变化时调整窗口高度（紧贴卡片，避免透明死区拦截点击） */
export function resizePopup(height: number): void {
  if (!win || win.isDestroyed()) return
  // 只夹上限；不设 DEFAULT_HEIGHT 下限——否则内容矮时窗口仍偏大，
  // 多出来的透明区域会捕获鼠标、挡住下层窗口的点击。
  const h = Math.min(MAX_HEIGHT, Math.max(80, Math.round(height)))
  const [w] = win.getSize()
  win.setSize(w, h, false)
}
