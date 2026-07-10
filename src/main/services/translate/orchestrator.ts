// 翻译聚合器：对每个"已启用且 Key 齐全"的平台并发调用，各自独立渲染，互不阻塞。
// 不用 Promise.all（一个失败不影响其他）。requestId 递增丢弃过期回包（防竞态）。

import type { TranslateProvider } from './types'
import type { AppConfig, EnabledProvider } from '../../../shared/types'
import { CH } from '../../../shared/channels'
import { createLocalProvider } from './local'
import { createTmtProvider } from './tmt'
import { createGlmProvider } from './glm'
import { createNiuProvider } from './niu'

type Sender = (channel: string, payload: unknown) => void

const REQUEST_TIMEOUT_MS = 10000

export class TranslateOrchestrator {
  private getConfig: () => AppConfig
  private providers: Map<string, TranslateProvider>
  private requestId = 0
  private currentAbort: AbortController | null = null

  constructor(getConfig: () => AppConfig) {
    this.getConfig = getConfig
    this.providers = new Map()
    this.providers.set('local', createLocalProvider())
    this.providers.set(
      'tmt',
      createTmtProvider(() => this.getConfig().translate.providers.tmt)
    )
    this.providers.set(
      'glm',
      createGlmProvider(() => this.getConfig().translate.providers.glm)
    )
    this.providers.set(
      'niu',
      createNiuProvider(() => this.getConfig().translate.providers.niu)
    )
  }

  getProvider(id: string): TranslateProvider | undefined {
    return this.providers.get(id)
  }

  /** 規則0：已启用且 Key 齐全的平台才出现在弹窗 */
  enabledProviders(): EnabledProvider[] {
    const cfg = this.getConfig().translate.providers
    const list: EnabledProvider[] = []
    if (cfg.local.enabled) list.push({ id: 'local', name: '免费翻译' })
    if (cfg.tmt.enabled && cfg.tmt.secretId && cfg.tmt.secretKey)
      list.push({ id: 'tmt', name: '腾讯 TMT' })
    if (cfg.glm.enabled && cfg.glm.apiKey) list.push({ id: 'glm', name: 'GLM-4.7-Flash' })
    if (cfg.niu.enabled && cfg.niu.appId && cfg.niu.apiKey)
      list.push({ id: 'niu', name: '小牛翻译' })
    return list
  }

  abort(): void {
    this.currentAbort?.abort()
    this.currentAbort = null
  }

  /** 发起一次翻译。各平台独立通过 send 回推状态。 */
  run(send: Sender, text: string, from: string, to: string): void {
    this.abort() // 取消上一次
    const rid = ++this.requestId
    const ctrl = new AbortController()
    this.currentAbort = ctrl

    const enabled = this.enabledProviders()
    for (const ep of enabled) {
      const provider = this.providers.get(ep.id)
      if (!provider) continue

      send(CH.PANEL_LOADING, { requestId: rid, providerId: ep.id })

      // 每个请求独立超时
      const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS)

      provider
        .translate({
          text,
          from,
          to,
          signal: ctrl.signal,
          onChunk: provider.streaming
            ? (delta) => {
                if (rid !== this.requestId) return
                send(CH.PANEL_SUCCESS, {
                  requestId: rid,
                  providerId: ep.id,
                  text: delta,
                  delta: true
                })
              }
            : undefined
        })
        .then((r) => {
          clearTimeout(timer)
          if (rid !== this.requestId) return // 过期回包丢弃
          // 流式平台已逐字推过，这里补一帧"完成"（带全文，渲染层据此结束 loading）
          send(CH.PANEL_SUCCESS, {
            requestId: rid,
            providerId: ep.id,
            text: r.text,
            delta: false,
            detectedLang: r.detectedLang
          })
        })
        .catch((e: unknown) => {
          clearTimeout(timer)
          if (rid !== this.requestId) return
          const message =
            ctrl.signal.aborted && !(e instanceof Error && e.message.includes('额度'))
              ? '请求超时'
              : e instanceof Error
                ? e.message
                : String(e)
          send(CH.PANEL_ERROR, { requestId: rid, providerId: ep.id, message })
        })
    }
  }
}
