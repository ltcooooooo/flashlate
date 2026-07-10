// 配置中心：electron-store 落盘 JSON；API 密钥用 safeStorage 加密后再存。
// 渲染层永远拿不到明文密钥，只拿"是否已填"的布尔状态。

import { safeStorage } from 'electron'
import storeModule from 'electron-store'
import type { AppConfig } from '../../shared/types'
// electron-store v11 为 ESM；不同打包/interop 下默认导出可能落在 .default 上，做一次兜底
const Store = (storeModule as unknown as { default?: typeof storeModule }).default ?? storeModule

const DEFAULTS: AppConfig = {
  general: { autoLaunch: false },
  hotkeys: { input: 'Alt+A', selection: 'Alt+D', ocr: 'Alt+S' },
  translate: {
    sourceLang: 'auto',
    targetLang: 'zh',
    providers: {
      local: { enabled: false },
      tmt: { enabled: false, secretId: '', secretKey: '', region: 'ap-guangzhou' },
      glm: { enabled: false, apiKey: '' },
      niu: { enabled: false, appId: '', apiKey: '' }
    }
  },
  tts: { active: 'edge', voice: 'zh-CN-XiaoxiaoNeural' },
  ocr: {
    active: 'baidu',
    providers: {
      baidu: { apiKey: '', secretKey: '' },
      tencent: { reuseTmt: true, secretId: '', secretKey: '', region: 'ap-guangzhou' }
    }
  }
}

// 加密前缀，区分明文与密文（safeStorage 不可用时回退明文并打标）
const ENC_PREFIX = 'enc:v1:'
const PLAIN_PREFIX = 'plain:v1:'

function encrypt(plain: string): string {
  if (!plain) return ''
  if (safeStorage.isEncryptionAvailable()) {
    return ENC_PREFIX + safeStorage.encryptString(plain).toString('base64')
  }
  // Linux libsecret 缺失等场景：回退明文（已知风险，UI 应提示）
  return PLAIN_PREFIX + Buffer.from(plain, 'utf8').toString('base64')
}

function decrypt(stored: string): string {
  if (!stored) return ''
  try {
    if (stored.startsWith(ENC_PREFIX)) {
      const buf = Buffer.from(stored.slice(ENC_PREFIX.length), 'base64')
      return safeStorage.decryptString(buf)
    }
    if (stored.startsWith(PLAIN_PREFIX)) {
      return Buffer.from(stored.slice(PLAIN_PREFIX.length), 'base64').toString('utf8')
    }
    return stored // 旧的纯明文
  } catch {
    return ''
  }
}

// 各平台的"密钥字段"清单，用于统一加解密
const SECRET_PATHS = [
  ['translate', 'providers', 'tmt', 'secretId'],
  ['translate', 'providers', 'tmt', 'secretKey'],
  ['translate', 'providers', 'glm', 'apiKey'],
  ['translate', 'providers', 'niu', 'appId'],
  ['translate', 'providers', 'niu', 'apiKey'],
  ['ocr', 'providers', 'baidu', 'apiKey'],
  ['ocr', 'providers', 'baidu', 'secretKey'],
  ['ocr', 'providers', 'tencent', 'secretId'],
  ['ocr', 'providers', 'tencent', 'secretKey']
] as const

const store = new Store<{ config: AppConfig }>({ name: 'flashlate-config' })

function deepMerge<T>(base: T, override: Partial<T>): T {
  const out = { ...base } as Record<string, unknown>
  for (const [k, v] of Object.entries(override ?? {})) {
    const bv = (base as Record<string, unknown>)[k]
    if (v && typeof v === 'object' && !Array.isArray(v) && bv && typeof bv === 'object') {
      out[k] = deepMerge(bv, v as Record<string, unknown>)
    } else if (v !== undefined) {
      out[k] = v
    }
  }
  return out as T
}

function getNode(obj: Record<string, unknown>, path: readonly string[]): Record<string, unknown> {
  let n = obj
  for (let i = 0; i < path.length - 1; i++) n = n[path[i]] as Record<string, unknown>
  return n
}

/** 读出解密后的完整配置（仅主进程内部使用，含明文密钥） */
export function loadConfig(): AppConfig {
  const raw = deepMerge(DEFAULTS, (store.get('config') as Partial<AppConfig>) ?? {})
  for (const path of SECRET_PATHS) {
    const node = getNode(raw as unknown as Record<string, unknown>, path)
    const key = path[path.length - 1]
    node[key] = decrypt(String(node[key] ?? ''))
  }
  return raw
}

/** 写入配置（自动加密密钥字段） */
export function saveConfig(cfg: AppConfig): void {
  const clone = JSON.parse(JSON.stringify(cfg)) as AppConfig
  for (const path of SECRET_PATHS) {
    const node = getNode(clone as unknown as Record<string, unknown>, path)
    const key = path[path.length - 1]
    node[key] = encrypt(String(node[key] ?? ''))
  }
  store.set('config', clone)
}

export function isEncryptionAvailable(): boolean {
  return safeStorage.isEncryptionAvailable()
}
