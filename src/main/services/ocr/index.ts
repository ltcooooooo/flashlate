// OCR 引擎：单选（baidu 首发 / tencent 备用）。统一 OcrProvider 接口 + verifyKey。

import type { AppConfig, VerifyResult } from '../../../shared/types'
import { recognizeBaidu, verifyBaidu } from './baidu'
import { recognizeTencent, verifyTencent } from './tencent'

export class OcrService {
  private getConfig: () => AppConfig
  constructor(getConfig: () => AppConfig) {
    this.getConfig = getConfig
  }

  /** 当前激活引擎是否 Key 齐全（規則0：不全则不可选中） */
  activeReady(): boolean {
    const ocr = this.getConfig().ocr
    if (ocr.active === 'baidu') {
      const b = ocr.providers.baidu
      return !!(b.apiKey && b.secretKey)
    }
    const t = ocr.providers.tencent
    const tmt = this.getConfig().translate.providers.tmt
    const id = t.reuseTmt ? tmt.secretId : t.secretId
    const key = t.reuseTmt ? tmt.secretKey : t.secretKey
    return !!(id && key)
  }

  /** 识别图片（base64，不含 data 前缀），返回按行拼接的文本 */
  async recognize(imageBase64: string): Promise<string> {
    const ocr = this.getConfig().ocr
    if (ocr.active === 'baidu') {
      return recognizeBaidu(imageBase64, ocr.providers.baidu)
    }
    const t = ocr.providers.tencent
    const tmt = this.getConfig().translate.providers.tmt
    return recognizeTencent(imageBase64, {
      secretId: t.reuseTmt ? tmt.secretId : t.secretId,
      secretKey: t.reuseTmt ? tmt.secretKey : t.secretKey,
      region: t.region || 'ap-guangzhou'
    })
  }

  async verify(id: 'baidu' | 'tencent', config: Record<string, string>): Promise<VerifyResult> {
    if (id === 'baidu') return verifyBaidu(config)
    return verifyTencent(config)
  }
}
