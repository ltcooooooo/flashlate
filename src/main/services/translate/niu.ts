// 小牛翻译（NiuTrans）文本翻译。表单 POST + MD5 签名（authStr）。

import crypto from 'node:crypto'
import type { TranslateProvider, TranslateRequest, TranslateResult } from './types'
import type { VerifyResult } from '../../../shared/types'
import { httpsRequest } from '../../lib/https'

// 统一码 → 小牛码。绝大多数与 ISO 一致，仅繁体特殊（zh-TW→cht）。来源：实测官方接口。
const NIU_CODE: Record<string, string> = {
  auto: 'auto',
  zh: 'zh',
  'zh-TW': 'cht',
  en: 'en',
  ja: 'ja',
  ko: 'ko',
  fr: 'fr',
  de: 'de',
  es: 'es',
  it: 'it',
  ru: 'ru',
  pt: 'pt',
  tr: 'tr',
  vi: 'vi',
  id: 'id',
  ms: 'ms',
  th: 'th'
}

const HOST = 'api.niutrans.com'
const PATH = '/v2/text/translate'

/** 生成 authStr：apikey 并入参数集，过滤空值，按键名升序拼接后 MD5（小写）。apikey 不进请求体。 */
function generateAuthStr(params: Record<string, string | number>, apiKey: string): string {
  const all: Record<string, string | number> = { ...params, apikey: apiKey }
  const filtered: Record<string, string | number> = {}
  for (const [k, v] of Object.entries(all)) {
    // 过滤 undefined/null/空字符串（数字 0 保留）
    if (v !== undefined && v !== null && v !== '') filtered[k] = v
  }
  const paramStr = Object.keys(filtered)
    .sort()
    .map((k) => `${k}=${filtered[k]}`)
    .join('&')
  return crypto.createHash('md5').update(paramStr, 'utf8').digest('hex')
}

interface NiuResponse {
  from?: string
  to?: string
  tgtText?: string
  errorCode?: string
  errorMsg?: string
}

async function callNiu(
  appId: string,
  apiKey: string,
  from: string,
  to: string,
  srcText: string,
  signal?: AbortSignal,
  timeout = 15000
): Promise<NiuResponse> {
  const params: Record<string, string | number> = {
    from,
    to,
    appId,
    timestamp: Math.floor(Date.now() / 1000), // 秒级
    srcText
  }
  const authStr = generateAuthStr(params, apiKey)
  const body = new URLSearchParams({
    ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
    authStr
  }).toString()

  const p = httpsRequest({
    hostname: HOST,
    path: PATH,
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(body)
    },
    body,
    timeout
  }).then(({ status, text }) => {
    let json: NiuResponse
    try {
      json = JSON.parse(text) as NiuResponse
    } catch {
      throw new Error(`返回异常（HTTP ${status}）`)
    }
    return json
  })

  return signal ? raceAbort(p, signal) : p
}

export function createNiuProvider(
  getConfig: () => { appId: string; apiKey: string }
): TranslateProvider {
  return {
    id: 'niu',
    name: '小牛翻译',
    streaming: false,

    async translate(req: TranslateRequest): Promise<TranslateResult> {
      const { appId, apiKey } = getConfig()
      const from = NIU_CODE[req.from] ?? req.from
      const to = NIU_CODE[req.to]
      if (!to) throw new Error(`小牛不支持目标语种 ${req.to}`)

      const res = await callNiu(appId, apiKey, from, to, req.text, req.signal)
      if (res.errorCode) throw new Error(friendlyNiuError(res))
      if (typeof res.tgtText !== 'string') throw new Error('返回异常')
      return { text: res.tgtText, detectedLang: res.from }
    },

    async verifyKey(config: Record<string, string>): Promise<VerifyResult> {
      const t0 = Date.now()
      try {
        const res = await callNiu(config.appId, config.apiKey, 'en', 'zh', 'hello')
        if (res.errorCode) return { ok: false, message: friendlyNiuError(res) }
        if (res.tgtText) return { ok: true, message: '密钥可用', ms: Date.now() - t0 }
        return { ok: false, message: '返回异常' }
      } catch (e) {
        return { ok: false, message: e instanceof Error ? e.message : String(e) }
      }
    }
  }
}

// httpsRequest 无 AbortSignal，自己包一层竞速以支持取消（与 tmt 一致）
function raceAbort<T>(p: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) return reject(new Error('已取消'))
    const onAbort = (): void => reject(new Error('已取消'))
    signal.addEventListener('abort', onAbort, { once: true })
    p.then(
      (v) => {
        signal.removeEventListener('abort', onAbort)
        resolve(v)
      },
      (e) => {
        signal.removeEventListener('abort', onAbort)
        reject(e)
      }
    )
  })
}

function friendlyNiuError(res: NiuResponse): string {
  const code = res.errorCode ?? ''
  const msg = res.errorMsg ?? ''
  // 20001 鉴权失败 / 20002 传参不符合规范——均为 appId/apiKey 错误或签名不匹配
  if (code === '20001' || code === '20002') return '密钥无效或签名失败'
  // 余额/频率类
  if (/余额|额度|流量|超.*限/.test(msg)) return '额度已用尽或被限流'
  return msg ? `${msg}（${code}）` : `错误码 ${code}`
}
