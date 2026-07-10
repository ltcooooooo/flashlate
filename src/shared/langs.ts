// App 统一语种集合（canonical，用 ISO 码做基准）。UI 下拉只认这一份。
// 各 Provider 再各自声明 codeMap 把统一码转成平台码（如腾讯 ja→jp、ko→kr）。
// 移植自 api-verify/src/langs.js 的设计结论。

export interface AppLanguage {
  code: string
  name: string
  /** 仅可作为源语种（如 auto 自动检测） */
  sourceOnly?: boolean
}

export const APP_LANGUAGES: AppLanguage[] = [
  { code: 'auto', name: '自动检测', sourceOnly: true },
  { code: 'zh', name: '中文(简体)' },
  { code: 'zh-TW', name: '中文(繁体)' },
  { code: 'en', name: '英语' },
  { code: 'ja', name: '日语' },
  { code: 'ko', name: '韩语' },
  { code: 'fr', name: '法语' },
  { code: 'de', name: '德语' },
  { code: 'es', name: '西班牙语' },
  { code: 'it', name: '意大利语' },
  { code: 'ru', name: '俄语' },
  { code: 'pt', name: '葡萄牙语' },
  { code: 'tr', name: '土耳其语' },
  { code: 'vi', name: '越南语' },
  { code: 'id', name: '印尼语' },
  { code: 'ms', name: '马来语' },
  { code: 'th', name: '泰语' }
]

/** 源语种下拉（含 auto） */
export const SOURCE_LANGUAGES = APP_LANGUAGES
/** 目标语种下拉（不含 auto） */
export const TARGET_LANGUAGES = APP_LANGUAGES.filter((l) => !l.sourceOnly)
