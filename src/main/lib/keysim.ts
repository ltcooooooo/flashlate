// 跨平台模拟"复制"按键（划词捕获核心）。移植自 electron-poc/lib/keysim.js。
// @nut-tree-fork/nut-js 基于 N-API，ABI 稳定，Electron 下无需 rebuild（PoC 已验证）。

import { keyboard, Key } from '@nut-tree-fork/nut-js'

keyboard.config.autoDelayMs = 6 // 按键动作间留极短间隔，保证组合键被正确识别

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export async function simulateCopy(): Promise<void> {
  const mod = process.platform === 'darwin' ? Key.LeftSuper : Key.LeftControl

  // 关键修复：用 Alt+D 这类热键触发时，用户往往还按着 Alt（或 Ctrl/Shift）。
  // 若此刻直接发 Ctrl+C，系统实际收到的是 Alt+Ctrl+C，不会触发复制。
  // 因此先把可能残留的所有修饰键"抬起"，再发干净的 Ctrl+C。
  try {
    await keyboard.releaseKey(
      Key.LeftAlt,
      Key.RightAlt,
      Key.LeftControl,
      Key.RightControl,
      Key.LeftShift,
      Key.RightShift,
      Key.LeftSuper,
      Key.RightSuper
    )
  } catch {
    /* 某些键不存在时忽略 */
  }
  await sleep(30) // 给系统一点时间处理"修饰键抬起"

  // 正确时序：先按住修饰键 → 按下 C → 松开 C → 松开修饰键
  await keyboard.pressKey(mod)
  await keyboard.pressKey(Key.C)
  await keyboard.releaseKey(Key.C)
  await keyboard.releaseKey(mod)
}
