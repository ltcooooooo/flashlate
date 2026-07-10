import type { VerifyResult } from '../../../shared/types'

export interface TranslateRequest {
  text: string
  from: string // 统一码（auto/en/zh...）
  to: string // 统一码
  signal: AbortSignal
  /** LLM 类流式逐字回调 */
  onChunk?: (s: string) => void
}

export interface TranslateResult {
  text: string
  detectedLang?: string
}

export interface TranslateProvider {
  id: 'local' | 'tmt' | 'glm' | 'niu'
  name: string
  /** 该平台支持流式（逐字渲染） */
  streaming: boolean
  translate(req: TranslateRequest): Promise<TranslateResult>
  /** 用最小请求验证密钥可用性（设置页测试按钮 / 自动启用前校验） */
  verifyKey(config: Record<string, string>): Promise<VerifyResult>
}
