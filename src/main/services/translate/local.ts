// 云端 LibreTranslate 翻译服务。通过 HTTPS 请求部署在服务器上的 LT 服务，
// 仅支持中英互译。无需 API Key。

import http from 'node:http'
import type { TranslateProvider, TranslateRequest, TranslateResult } from './types'
import type { VerifyResult } from '../../../shared/types'

// 本地开发时自动使用 localhost，生产环境用域名
const LT_HOST = 'translate.tianci.run'
const TIMEOUT = 10000

// 统一码 → LT 码（LT 用 zh 表示简体中文）
const LOCAL_CODE: Record<string, string> = {
  auto: 'auto',
  zh: 'zh',
  en: 'en'
}

function httpRequest(path: string, body: object): Promise<{ status: number; data: unknown }> {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(body)
    const req = http.request(
      {
        hostname: LT_HOST,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        },
        timeout: TIMEOUT
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c) => chunks.push(c as Buffer))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          try {
            resolve({ status: res.statusCode ?? 0, data: JSON.parse(text) })
          } catch {
            resolve({ status: res.statusCode ?? 0, data: text })
          }
        })
      }
    )
    req.on('timeout', () => {
      req.destroy(new Error('请求超时'))
    })
    req.on('error', reject)
    req.write(postData)
    req.end()
  })
}

export function createLocalProvider(): TranslateProvider {
  return {
    id: 'local',
    name: '免费翻译',
    streaming: false,

    async translate(req: TranslateRequest): Promise<TranslateResult> {
      const source = LOCAL_CODE[req.from] ?? req.from
      const target = LOCAL_CODE[req.to]
      if (!target) throw new Error(`免费翻译不支持目标语种 ${req.to}`)

      // 用 AbortSignal 支持取消
      const p = httpRequest('/api/translate', {
        q: req.text,
        source,
        target,
        format: 'text'
      })

      const { status, data } = await raceAbort(p, req.signal)

      if (status !== 200) {
        const msg = (data as { error?: string })?.error ?? `HTTP ${status}`
        throw new Error(msg)
      }

      const result = data as { translatedText: string; detectedLanguage?: { language: string } }
      if (!result.translatedText) throw new Error('返回异常')

      return {
        text: result.translatedText,
        detectedLang: result.detectedLanguage?.language
      }
    },

    async verifyKey(): Promise<VerifyResult> {
      const t0 = Date.now()
      try {
        // 测试：翻译一个简单词
        const { status, data } = await httpRequest('/api/translate', {
          q: 'hello',
          source: 'auto',
          target: 'zh',
          format: 'text'
        })
        if (status === 200 && (data as { translatedText?: string })?.translatedText) {
          return { ok: true, message: '服务可用', ms: Date.now() - t0 }
        }
        return { ok: false, message: `服务异常（HTTP ${status}）` }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return { ok: false, message: `无法连接服务：${msg}` }
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
