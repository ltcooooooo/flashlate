// 腾讯 TMT 文本翻译（首发，500万字符/月免费）。用官方 SDK，免手写 TC3 签名。
// 移植自 api-verify/src/tencent-translate.js。

import type { TranslateProvider, TranslateRequest, TranslateResult } from './types'
import type { VerifyResult } from '../../../shared/types'

// 统一码 → 腾讯码（注意 ja→jp、ko→kr 等非 ISO 差异）。来源：官方文档静态表，无查询接口。
const TENCENT_CODE: Record<string, string> = {
  auto: 'auto',
  zh: 'zh',
  'zh-TW': 'zh-TW',
  en: 'en',
  ja: 'jp',
  ko: 'kr',
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

interface TmtClientLike {
  TextTranslate(req: {
    SourceText: string
    Source: string
    Target: string
    ProjectId: number
  }): Promise<{ Source: string; Target: string; TargetText: string }>
}

function buildClient(secretId: string, secretKey: string, region: string): TmtClientLike {
  // SDK 是 CommonJS，用 require 动态加载（主进程 Node 环境）
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

export function createTmtProvider(
  getConfig: () => {
    secretId: string
    secretKey: string
    region: string
  }
): TranslateProvider {
  return {
    id: 'tmt',
    name: '腾讯 TMT',
    streaming: false,

    async translate(req: TranslateRequest): Promise<TranslateResult> {
      const { secretId, secretKey, region } = getConfig()
      const source = TENCENT_CODE[req.from] ?? req.from
      const target = TENCENT_CODE[req.to]
      if (!target) throw new Error(`腾讯不支持目标语种 ${req.to}`)

      const client = buildClient(secretId, secretKey, region)
      // SDK 无 AbortSignal，自己包一层竞速以支持取消
      const res = await raceAbort(
        client.TextTranslate({
          SourceText: req.text,
          Source: source,
          Target: target,
          ProjectId: 0
        }),
        req.signal
      )
      return { text: res.TargetText, detectedLang: res.Source }
    },

    async verifyKey(config: Record<string, string>): Promise<VerifyResult> {
      const t0 = Date.now()
      try {
        const client = buildClient(
          config.secretId,
          config.secretKey,
          config.region || 'ap-guangzhou'
        )
        const res = await client.TextTranslate({
          SourceText: 'hello',
          Source: 'en',
          Target: 'zh',
          ProjectId: 0
        })
        if (res?.TargetText) return { ok: true, message: '密钥可用', ms: Date.now() - t0 }
        return { ok: false, message: '返回异常' }
      } catch (e) {
        return { ok: false, message: friendlyTmtError(e) }
      }
    }
  }
}

function raceAbort<T>(p: Promise<T>, signal: AbortSignal): Promise<T> {
  if (!signal) return p
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

function friendlyTmtError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  if (/AuthFailure|SecretId|signature/i.test(msg)) return '密钥无效或签名失败'
  if (/LimitExceeded|quota/i.test(msg)) return '免费额度已用尽'
  if (/UnsupportedLanguage|language/i.test(msg)) return '不支持该语向'
  return msg
}
