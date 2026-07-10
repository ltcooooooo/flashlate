// 主进程共享状态：当前配置（含明文密钥，仅主进程内）、翻译聚合器、OCR 服务。

import type { AppConfig } from '../shared/types'
import { loadConfig, saveConfig } from './config/store'
import { TranslateOrchestrator } from './services/translate/orchestrator'
import { OcrService } from './services/ocr'

// 必须在 app.whenReady() 之后才能调 loadConfig（safeStorage 解密依赖 app ready）。
// 故用 initState() 延迟加载，切勿在模块顶层直接 loadConfig，否则解密失败导致密钥被清空。
let config!: AppConfig

export const orchestrator = new TranslateOrchestrator(() => config)
export const ocrService = new OcrService(() => config)

/** 在 app ready 之后调用一次，加载并解密配置 */
export function initState(): void {
  config = loadConfig()
}

export function getConfig(): AppConfig {
  return config
}

/** 替换并持久化配置（密钥在 store 内自动加密） */
export function updateConfig(next: AppConfig): void {
  config = next
  saveConfig(config)
}
