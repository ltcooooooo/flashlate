// 应用更新服务。
// - Windows：走 electron-updater 完整流程（检查 → 下载 → 重启安装）。
// - Mac：使用 electron-updater 检测版本（基于 latest.yml），有新版则引导用户去 GitHub Release 手动下载 dmg。
// 状态经 CH.UPDATE_STATUS 单通道广播给所有窗口；同时缓存最近一次状态，
// 新建窗口可通过 CH.UPDATE_GET_LAST 在挂载后取回（避免"广播先于窗口 mount"导致的状态丢失）。
// 应用不强推用户更新，所有进展由 popup 下载图标 / 设置 → 关于 页承载，不弹任何原生对话框。

import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import pkg from 'electron-updater'
import { CH } from '../../shared/channels'
import type { UpdateStatus } from '../../shared/types'

const { autoUpdater } = pkg

const isMac = process.platform === 'darwin'
const isDev = !app.isPackaged

const GH_OWNER = 'ltcooooooo'
const GH_REPO = 'flashlate'
const RELEASES_PAGE = `https://github.com/${GH_OWNER}/${GH_REPO}/releases/latest`

/** 最近一次广播的更新状态：用于窗口挂载后回放（避免错过早期广播） */
let lastStatus: UpdateStatus | null = null

/** 向所有窗口广播更新状态，并同步缓存最新一帧 */
function broadcast(status: UpdateStatus): void {
  lastStatus = status
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(CH.UPDATE_STATUS, status)
  }
}

/** 读取最近一次状态（窗口 mount 时回放用）。返回 null 表示尚无状态 */
export function getLastStatus(): UpdateStatus | null {
  return lastStatus
}

/** 注册 electron-updater 事件 */
export function registerUpdater(): void {
  if (isDev) {
    // 允许在开发期用 dev-app-update.yml 联调（electron-updater 默认仅打包后生效）
    Object.defineProperty(app, 'isPackaged', { get: () => true })
    autoUpdater.updateConfigPath = join(process.cwd(), 'dev-app-update.yml')
  }

  autoUpdater.autoDownload = false // 由用户确认后再下载
  autoUpdater.allowDowngrade = true // 允许降级（应付回滚）

  autoUpdater.on('checking-for-update', () => broadcast({ state: 'checking' }))

  autoUpdater.on('update-available', (info) => {
    if (isMac) {
      // Mac：仅广播可用 + 引导跳转地址，渲染层负责展示入口
      broadcast({ state: 'available', version: info.version, platform: 'mac', releaseUrl: RELEASES_PAGE })
    } else {
      // Windows：正常走下载流程
      broadcast({ state: 'available', version: info.version, platform: 'win' })
    }
  })

  autoUpdater.on('update-not-available', () => {
    broadcast({ state: 'not-available' })
  })

  autoUpdater.on('download-progress', (p) => {
    broadcast({ state: 'downloading', percent: Math.floor(p.percent) })
  })

  autoUpdater.on('update-downloaded', (info) => {
    // 关于页的「立即重启」按钮驱动 quitAndInstall，不再弹原生确认框
    broadcast({ state: 'downloaded', version: info.version })
  })

  autoUpdater.on('error', (err) => {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[updater] error', message)
    broadcast({ state: 'error', message })
  })
}

/** 检查更新入口。lastStatus 缓存保留最近一次状态，新挂载的窗口能回放，无需 manual 标志 */
export function checkForUpdates(): void {
  void autoUpdater.checkForUpdates().catch((e) => {
    const message = e instanceof Error ? e.message : String(e)
    console.error('[updater] checkForUpdates error', message)
    broadcast({ state: 'error', message })
  })
}

/** 开始下载（仅 Windows） */
export function startDownload(): void {
  if (isMac) return
  void autoUpdater.downloadUpdate().catch((e) => {
    const message = e instanceof Error ? e.message : String(e)
    console.error('[updater] downloadUpdate error', message)
    broadcast({ state: 'error', message })
  })
}

/** 重启安装（仅 Windows） */
export function quitAndInstall(): void {
  if (isMac) return
  autoUpdater.quitAndInstall()
}
