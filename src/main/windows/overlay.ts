// 截图选区遮罩窗口池（多屏/HiDPI）。移植自 electron-poc/main.js。
// 启动预创建每屏一个透明遮罩窗，按热键只 show()，省去创建开销。

import { BrowserWindow, screen, desktopCapturer, nativeImage } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

interface OverlayEntry {
  win: BrowserWindow
  displayId: number
}
interface Shot {
  image: Electron.NativeImage
  scale: number
  bounds: Electron.Rectangle
}

let pool: OverlayEntry[] = []
const activeShots = new Map<number, Shot>()
let busy = false

// 选区回传后的回调（裁剪好的图片 base64 或 null=取消）
type RegionResolver = (imageBase64: string | null) => void
let pendingResolve: RegionResolver | null = null

function overlayUrl(): string {
  return is.dev && process.env['ELECTRON_RENDERER_URL']
    ? `${process.env['ELECTRON_RENDERER_URL']}/overlay.html`
    : join(__dirname, '../renderer/overlay.html')
}

function createOverlay(display: Electron.Display): OverlayEntry {
  const win = new BrowserWindow({
    transparent: true,
    show: false,
    frame: false,
    roundedCorners: false,
    focusable: true,
    skipTaskbar: true,
    hasShadow: false,
    hiddenInMissionControl: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  win.setBounds(display.bounds)
  win.setResizable(false)
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  const url = overlayUrl()
  if (url.startsWith('http')) win.loadURL(url)
  else win.loadFile(url)
  return { win, displayId: display.id }
}

export function buildOverlayPool(): void {
  if (busy) return
  destroyOverlayPool()
  for (const d of screen.getAllDisplays()) pool.push(createOverlay(d))
}

export function destroyOverlayPool(): void {
  for (const o of pool) if (o.win && !o.win.isDestroyed()) o.win.destroy()
  pool = []
}

async function captureDisplay(display: Electron.Display): Promise<Shot | null> {
  const scale = display.scaleFactor
  const { width, height } = display.size
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: Math.round(width * scale), height: Math.round(height * scale) }
  })
  const src = sources.find((s) => String(s.display_id) === String(display.id))
  if (!src) return null
  return { image: src.thumbnail, scale, bounds: display.bounds }
}

/** 发起一次框选，resolve 裁剪后的图片 base64（不含 data 前缀）或 null（取消/失败） */
export function startCapture(): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    if (busy) return resolve(null)
    busy = true
    pendingResolve = resolve
    void run()
  })

  async function run(): Promise<void> {
    try {
      if (!pool.length) {
        // 先建池但不能在 busy 时重建，临时放开
        busy = false
        buildOverlayPool()
        busy = true
      }
      const displays = screen.getAllDisplays()
      const results = await Promise.all(
        displays.map(async (d) => ({ id: d.id, bounds: d.bounds, shot: await captureDisplay(d) }))
      )
      activeShots.clear()
      for (const r of results) {
        if (!r.shot) continue
        activeShots.set(r.id, r.shot)
        const entry = pool.find((o) => o.displayId === r.id)
        if (entry && !entry.win.isDestroyed()) {
          entry.win.setBounds(r.bounds)
          await entry.win.webContents.executeJavaScript('reset()')
          entry.win.show()
          entry.win.focus()
        }
      }
      if (!activeShots.size) finish(null)
    } catch {
      finish(null)
    }
  }
}

async function endOverlays(): Promise<void> {
  activeShots.clear()
  for (const o of pool) {
    if (o.win && !o.win.isDestroyed()) {
      try {
        await o.win.webContents.executeJavaScript('reset()')
        await o.win.webContents.executeJavaScript(
          'new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))'
        )
      } catch {
        /* ignore */
      }
      o.win.hide()
    }
  }
}

function finish(result: string | null): void {
  const resolve = pendingResolve
  pendingResolve = null
  busy = false
  resolve?.(result)
}

/** overlay 渲染层回传选区（CSS 逻辑像素）；webContents 用于定位是哪块屏 */
export function handleRegion(
  sender: Electron.WebContents,
  rect: { x: number; y: number; width: number; height: number } | null
): void {
  const entry = pool.find((o) => o.win && !o.win.isDestroyed() && o.win.webContents === sender)
  const shot = entry ? activeShots.get(entry.displayId) : null
  void endOverlays()

  if (!rect || !shot) return finish(null) // 取消
  const { scale, image } = shot
  const crop = {
    x: Math.round(rect.x * scale),
    y: Math.round(rect.y * scale),
    width: Math.round(rect.width * scale),
    height: Math.round(rect.height * scale)
  }
  if (crop.width < 3 || crop.height < 3) return finish(null) // 选区太小

  const cropped = image.crop(crop)
  const dataUrl = cropped.toDataURL() // data:image/png;base64,xxx
  const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '')
  // 释放大位图引用
  void nativeImage // 保留引用以示意；cropped 离开作用域后由 GC 回收
  finish(base64)
}
