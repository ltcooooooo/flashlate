// 用原生 https 模块发请求（不走 undici/fetch）。
// 移植自 api-verify/src/_shared.js：部分 Windows 机器上 fetch 连不上百度/智谱，
// 但原生 https 能通（百度官方示例也用 https）。

import https from 'node:https'
import type { IncomingMessage } from 'node:http'

export interface HttpsOptions {
  hostname: string
  path: string
  method?: string
  headers?: Record<string, string | number>
  body?: string | null
  timeout?: number
}

/** 缓冲式请求，resolve { status, text } */
export function httpsRequest({
  hostname,
  path,
  method = 'GET',
  headers = {},
  body = null,
  timeout = 15000
}: HttpsOptions): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname, path, method, headers, agent: false, timeout }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c) => chunks.push(c as Buffer))
      res.on('end', () =>
        resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString('utf8') })
      )
    })
    req.on('timeout', () => req.destroy(new Error('请求超时')))
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

/** 流式请求，resolve 原始响应流（用于 SSE） */
export function httpsStream({
  hostname,
  path,
  method = 'POST',
  headers = {},
  body = null,
  timeout = 30000
}: HttpsOptions): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname, path, method, headers, agent: false, timeout }, resolve)
    req.on('timeout', () => req.destroy(new Error('请求超时')))
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}
