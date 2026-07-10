// 系统托盘：打开设置 / 暂停热键 / 退出。

import { app, Tray, Menu, nativeImage } from 'electron'
import { join } from 'path'
import { openSettings } from './windows/settings'
import { isPaused, setPaused } from './hotkeys'
import { getConfig } from './state'
import { setAutoLaunch } from './services/autolaunch'
import { broadcastConfigChanged, onConfigChange } from './ipc'

let tray: Tray | null = null

export function createTray(): void {
  const iconPath = join(__dirname, '../../resources/icon.png')
  const icon = nativeImage.createFromPath(iconPath)
  tray = new Tray(
    icon.isEmpty() ? nativeImage.createEmpty() : icon.resize({ width: 16, height: 16 })
  )
  tray.setToolTip('FlashLate 闪译')
  rebuildMenu()
  // 订阅配置变化：设置页修改 autoLaunch / 全局热键暂停后，托盘 checkbox 自动跟随
  onConfigChange(() => rebuildMenu())
}

export function rebuildMenu(): void {
  if (!tray) return
  const autoLaunch = !!getConfig().general?.autoLaunch
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: '开机自启',
        type: 'checkbox',
        checked: autoLaunch,
        click: () => {
          // 从最新 config 读起始状态，连续点击不会基于闭包旧值重复算同一方向
          void toggleAutoLaunch()
        }
      },
      {
        label: '启用全局热键',
        type: 'checkbox',
        checked: !isPaused(),
        click: () => {
          setPaused(!isPaused())
          rebuildMenu()
        }
      },
      { label: '设置…', click: () => openSettings() },
      { type: 'separator' },
      { label: '退出 FlashLate', click: () => app.quit() }
    ])
  )
}

async function toggleAutoLaunch(): Promise<void> {
  const next = !getConfig().general.autoLaunch
  await setAutoLaunch(next)
  broadcastConfigChanged()
  rebuildMenu()
}
