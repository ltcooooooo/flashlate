// 全局热键管理：注册三个热键 + 冲突检测 + 托盘暂停。
// 基础层用 Electron globalShortcut（覆盖 80% 场景，零原生依赖）。

import { globalShortcut } from 'electron'
import type { Hotkeys } from '../shared/types'

export type HotkeyAction = 'input' | 'selection' | 'ocr'
type Handler = (action: HotkeyAction) => void

let paused = false
let current: Hotkeys | null = null
let handler: Handler | null = null

/** 注册全部热键，返回各项是否成功（false=被占用） */
export function registerHotkeys(
  hotkeys: Hotkeys,
  onTrigger: Handler
): Record<HotkeyAction, boolean> {
  current = hotkeys
  handler = onTrigger
  globalShortcut.unregisterAll()

  const result: Record<HotkeyAction, boolean> = { input: false, selection: false, ocr: false }
  if (paused) return result

  const map: Array<[HotkeyAction, string]> = [
    ['input', hotkeys.input],
    ['selection', hotkeys.selection],
    ['ocr', hotkeys.ocr]
  ]
  for (const [action, accel] of map) {
    if (!accel) continue
    try {
      result[action] = globalShortcut.register(accel, () => handler?.(action))
    } catch {
      result[action] = false
    }
  }
  return result
}

/** 临时校验某个 accelerator 是否可注册（未被占用） */
export function validateAccelerator(accel: string): boolean {
  // 已是当前在用的热键 → 视为可用
  if (current && Object.values(current).includes(accel)) return true
  try {
    const ok = globalShortcut.register(accel, () => {})
    if (ok) globalShortcut.unregister(accel)
    return ok
  } catch {
    return false
  }
}

export function setPaused(value: boolean): void {
  paused = value
  if (current && handler) registerHotkeys(current, handler)
}

export function isPaused(): boolean {
  return paused
}

export function unregisterAll(): void {
  globalShortcut.unregisterAll()
}
