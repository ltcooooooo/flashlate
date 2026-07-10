// 开机自启：接入 auto-launch 包，与系统启动项（Windows 注册表 / macOS Login Items /
// Linux .desktop 文件）打交道。开发环境下不真正写入，避免污染启动项。
//
// 设计：
// - 期望值存于 electron-store（AppConfig.general.autoLaunch）。
// - 启动时以系统真实状态为准：若与 store 不一致则修正 store（用户在系统设置中手动
//   关闭的自启不应被下次启动又"复活"）。
// - 切换入口（设置页 / 托盘）调用 syncAutoLaunchState(enabled)，幂等地把系统设为期望值。
// - 错误一律吞掉：自启失败不应阻塞应用主体。

import AutoLaunch from 'auto-launch'
import { app } from 'electron'
import { getConfig, updateConfig } from '../state'
import type { AppConfig, GeneralConfig } from '../../shared/types'

let launcher: AutoLaunch | null = null

function getLauncher(): AutoLaunch {
  if (!launcher) {
    launcher = new AutoLaunch({
      name: 'FlashLate',
      path: app.getPath('exe')
    })
  }
  return launcher
}

/** 应用当前是否处于"已打包"状态。开发环境下自启读写走 no-op。 */
function isProduction(): boolean {
  return app.isPackaged
}

/** 把系统真实状态修正进 store（启动时跑一次）。返回"是否真的改了 store"。 */
export async function verifyAutoLaunchOnStartup(): Promise<boolean> {
  if (!isProduction()) return false
  try {
    const enabledInOs = await getLauncher().isEnabled()
    const cfg = getConfig()
    if (cfg.general.autoLaunch === enabledInOs) return false
    updateConfig({ ...cfg, general: { ...cfg.general, autoLaunch: enabledInOs } })
    return true
  } catch (e) {
    console.error('[autolaunch] verify failed:', e)
    return false
  }
}

/** 把 store 的期望值同步到系统（幂等）。 */
export async function syncAutoLaunchState(enabled: boolean): Promise<void> {
  if (!isProduction()) return
  try {
    const launcher = getLauncher()
    const enabledInOs = await launcher.isEnabled()
    if (enabled === enabledInOs) return
    if (enabled) await launcher.enable()
    else await launcher.disable()
  } catch (e) {
    console.error('[autolaunch] sync failed:', e)
  }
}

/** 切换自启并持久化：用于 IPC 写入路径。返回更新后的 general 配置。 */
export async function setAutoLaunch(enabled: boolean): Promise<GeneralConfig> {
  const cfg = getConfig()
  const next: AppConfig = {
    ...cfg,
    general: { ...cfg.general, autoLaunch: enabled }
  }
  updateConfig(next)
  await syncAutoLaunchState(enabled)
  return next.general
}
