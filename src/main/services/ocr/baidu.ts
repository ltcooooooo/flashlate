// 百度通用文字识别 OCR（首发，纯 HTTP 无 SDK）。移植自 api-verify/src/baidu-ocr.js。
// access_token 有效期约 30 天，进程内缓存到过期前。

import type { BaiduOcrConfig, VerifyResult } from '../../../shared/types'
import { httpsRequest } from '../../lib/https'

interface TokenCache {
  token: string
  expireAt: number
  apiKey: string // 绑定到具体 AK，换 Key 后作废
}
let tokenCache: TokenCache | null = null

async function getAccessToken(apiKey: string, secretKey: string): Promise<string> {
  const now = Date.now()
  if (tokenCache && tokenCache.apiKey === apiKey && tokenCache.expireAt > now + 60000) {
    return tokenCache.token
  }
  const param = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: apiKey,
    client_secret: secretKey
  }).toString()

  const { text } = await httpsRequest({
    hostname: 'aip.baidubce.com',
    path: '/oauth/2.0/token?' + param,
    method: 'POST'
  })
  const json = JSON.parse(text)
  if (!json.access_token) {
    throw new Error(
      '获取 access_token 失败：' + (json.error_description || json.error || '密钥无效')
    )
  }
  tokenCache = {
    token: json.access_token,
    // expires_in 单位秒（约 30 天），留 1 分钟余量
    expireAt: now + (json.expires_in ?? 2592000) * 1000,
    apiKey
  }
  return json.access_token
}

export async function recognizeBaidu(imageBase64: string, cfg: BaiduOcrConfig): Promise<string> {
  let token = await getAccessToken(cfg.apiKey, cfg.secretKey)
  const run = async (tk: string): Promise<{ json: Record<string, unknown> }> => {
    const form = new URLSearchParams()
    form.set('image', imageBase64)
    const formBody = form.toString()
    const { text } = await httpsRequest({
      hostname: 'aip.baidubce.com',
      path: `/rest/2.0/ocr/v1/general_basic?access_token=${tk}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(formBody)
      },
      body: formBody
    })
    return { json: JSON.parse(text) }
  }

  let { json } = await run(token)
  // token 失效（110/111）自动重刷一次
  if (json.error_code === 110 || json.error_code === 111) {
    tokenCache = null
    token = await getAccessToken(cfg.apiKey, cfg.secretKey)
    ;({ json } = await run(token))
  }
  if (json.error_code) {
    throw new Error('百度 OCR 错误：' + (json.error_msg || json.error_code))
  }
  const words = (json.words_result as Array<{ words: string }> | undefined) ?? []
  return words.map((w) => w.words).join('\n')
}

export async function verifyBaidu(config: Record<string, string>): Promise<VerifyResult> {
  const t0 = Date.now()
  try {
    tokenCache = null // 强制用新 Key 换 token
    await getAccessToken(config.apiKey, config.secretKey)
    return { ok: true, message: '密钥可用', ms: Date.now() - t0 }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}
