// 智谱 GLM-4.7-Flash 翻译（备用，OpenAI 兼容 + 流式 SSE）。
// 移植自 api-verify/src/glm.js，用原生 https 模块。

import type { TranslateProvider, TranslateRequest, TranslateResult } from './types'
import type { VerifyResult } from '../../../shared/types'
import { httpsStream } from '../../lib/https'
import { APP_LANGUAGES } from '../../../shared/langs'

function langName(code: string): string {
  return APP_LANGUAGES.find((l) => l.code === code)?.name ?? code
}

async function streamChat(
  apiKey: string,
  text: string,
  targetName: string,
  signal: AbortSignal,
  onChunk?: (s: string) => void
): Promise<string> {
  const body = JSON.stringify({
    model: 'glm-4.7-flash',
    messages: [
      {
        role: 'system',
        content: `你是专业翻译引擎。把用户文本翻译成${targetName}，只输出译文本身，不要解释、不要加引号、保留原文换行与段落。`
      },
      { role: 'user', content: text }
    ],
    thinking: { type: 'disabled' }, // 翻译无需推理，关闭以降低首字延迟
    stream: true,
    temperature: 0.2
  })

  const res = await httpsStream({
    hostname: 'open.bigmodel.cn',
    path: '/api/paas/v4/chat/completions',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'Content-Length': Buffer.byteLength(body)
    },
    body
  })

  // 取消：中断底层 socket
  const onAbort = (): void => {
    res.destroy(new Error('已取消'))
  }
  signal.addEventListener('abort', onAbort, { once: true })

  if (res.statusCode !== 200) {
    const chunks: Buffer[] = []
    for await (const c of res) chunks.push(c as Buffer)
    const errText = Buffer.concat(chunks).toString('utf8')
    throw new Error(httpErrToMsg(res.statusCode ?? 0, errText))
  }

  let buf = ''
  let out = ''
  res.setEncoding('utf8')
  try {
    for await (const chunk of res) {
      buf += chunk
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const line of lines) {
        const s = line.trim()
        if (!s.startsWith('data:')) continue
        const data = s.slice(5).trim()
        if (data === '[DONE]') continue
        try {
          const json = JSON.parse(data)
          const delta = json.choices?.[0]?.delta?.content
          if (delta) {
            out += delta
            onChunk?.(delta)
          }
        } catch {
          /* 忽略心跳/非 JSON 行 */
        }
      }
    }
  } finally {
    signal.removeEventListener('abort', onAbort)
  }
  return out
}

function httpErrToMsg(status: number, text: string): string {
  if (status === 401) return '密钥无效'
  if (status === 429) return '请求过于频繁（免费版限流）'
  try {
    const j = JSON.parse(text)
    if (j?.error?.message) return j.error.message
  } catch {
    /* ignore */
  }
  return `HTTP ${status}`
}

export function createGlmProvider(getConfig: () => { apiKey: string }): TranslateProvider {
  return {
    id: 'glm',
    name: 'GLM-4.7-Flash',
    streaming: true,

    async translate(req: TranslateRequest): Promise<TranslateResult> {
      const { apiKey } = getConfig()
      const text = await streamChat(apiKey, req.text, langName(req.to), req.signal, req.onChunk)
      return { text }
    },

    async verifyKey(config: Record<string, string>): Promise<VerifyResult> {
      const t0 = Date.now()
      const ctrl = new AbortController()
      // 限流严重，校验给 30s
      const timer = setTimeout(() => ctrl.abort(), 30000)
      try {
        const out = await streamChat(config.apiKey, 'hello', '简体中文', ctrl.signal)
        clearTimeout(timer)
        if (out.trim()) return { ok: true, message: '密钥可用', ms: Date.now() - t0 }
        return { ok: false, message: '无译文返回（可能限流）' }
      } catch (e) {
        clearTimeout(timer)
        return { ok: false, message: e instanceof Error ? e.message : String(e) }
      }
    }
  }
}
