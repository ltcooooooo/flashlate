// 腾讯图片翻译 ImageTranslateLLM（备用 OCR）。移植自 api-verify/src/tencent-ocr.js。
// 取 SourceText（识别原文）填输入框，忽略 TargetText/TargetData。与 TMT 共用密钥。

import type { VerifyResult } from '../../../shared/types'

interface TmtClientLike {
  ImageTranslateLLM(req: {
    Target: string
    Data: string
  }): Promise<{ Source: string; Target: string; SourceText?: string }>
}

function buildClient(secretId: string, secretKey: string, region: string): TmtClientLike {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('tencentcloud-sdk-nodejs-tmt')
  const ns = mod.default ?? mod
  const TmtClient = ns.tmt.v20180321.Client
  return new TmtClient({
    credential: { secretId, secretKey },
    region,
    profile: { httpProfile: { endpoint: 'tmt.tencentcloudapi.com' } }
  })
}

export async function recognizeTencent(
  imageBase64: string,
  cfg: { secretId: string; secretKey: string; region: string }
): Promise<string> {
  const client = buildClient(cfg.secretId, cfg.secretKey, cfg.region)
  const res = await client.ImageTranslateLLM({ Target: 'zh', Data: imageBase64 })
  return res.SourceText ?? ''
}

export async function verifyTencent(config: Record<string, string>): Promise<VerifyResult> {
  const t0 = Date.now()
  try {
    const client = buildClient(config.secretId, config.secretKey, config.region || 'ap-guangzhou')
    // 1x1 透明 PNG，验证签名/鉴权通路（识别无文字也算密钥可用）
    const tinyPng =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    await client.ImageTranslateLLM({ Target: 'zh', Data: tinyPng })
    return { ok: true, message: '密钥可用', ms: Date.now() - t0 }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    // 图片相关错误说明签名通过、仅图片内容问题 → 视为密钥可用
    if (/image|图片|FailedOperation\.(NoText|ImageError)/i.test(msg)) {
      return { ok: true, message: '密钥可用', ms: Date.now() - t0 }
    }
    if (/AuthFailure|SecretId|signature/i.test(msg)) {
      return { ok: false, message: '密钥无效或签名失败' }
    }
    return { ok: false, message: msg }
  }
}
