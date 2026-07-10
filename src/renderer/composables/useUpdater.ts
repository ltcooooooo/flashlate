import { ref, computed, onMounted, onUnmounted, type Ref, type ComputedRef } from 'vue'
import { CH } from '@shared/channels'
import type { UpdateStatus } from '@shared/types'

type UpdateState = UpdateStatus['state'] | 'idle'

/**
 * 更新状态机（对接主进程 CH.UPDATE_STATUS 广播 + UPDATE_GET_LAST 回放）。
 * - popup 只用 `available` 决定是否显示更新图标。
 * - 设置「关于」页用完整状态驱动检查/下载/安装/前往下载页。
 * 平台差异：Windows 走 electron-updater（下载→重启安装）；Mac 引导去 releaseUrl 手动下载。
 */
export function useUpdater(): {
  status: Ref<UpdateState>
  available: ComputedRef<boolean>
  version: Ref<string>
  releaseUrl: Ref<string>
  percent: Ref<number>
  errorMessage: Ref<string>
  isMac: ComputedRef<boolean>
  tipText: ComputedRef<string>
  check: () => void
  primaryAction: () => void
} {
  const status = ref<UpdateState>('idle')
  const version = ref('')
  const releaseUrl = ref('')
  const percent = ref(0)
  const errorMessage = ref('')
  const platform = ref<'win' | 'mac'>(/Mac|Macintosh/.test(navigator.userAgent) ? 'mac' : 'win')

  const available = computed(() => status.value === 'available' || status.value === 'downloaded')
  const isMac = computed(() => platform.value === 'mac')

  const tipText = computed(() => {
    switch (status.value) {
      case 'checking':
        return '正在检查更新…'
      case 'available':
        return `发现新版本 v${version.value}`
      case 'not-available':
        return '已是最新版本'
      case 'downloading':
        return `下载中 ${percent.value}%`
      case 'downloaded':
        return `v${version.value} 已就绪，可重启安装`
      case 'error':
        return errorMessage.value ? `检查更新失败：${errorMessage.value}` : '检查更新失败'
      default:
        return ''
    }
  })

  let unsub: (() => void) | null = null

  // 原子写入：在一个函数中同时维护 status & 字段，避免 caller 二次设值带来不一致状态
  function apply(s: UpdateStatus): void {
    status.value = s.state
    if (s.state === 'available') {
      version.value = s.version
      platform.value = s.platform
      releaseUrl.value = s.releaseUrl ?? ''
    } else if (s.state === 'downloading') {
      percent.value = s.percent
    } else if (s.state === 'downloaded') {
      version.value = s.version
    } else if (s.state === 'error') {
      errorMessage.value = s.message
      // 下载中途出错后重置，避免后续状态污染
      percent.value = 0
    } else if (s.state === 'not-available') {
      // 清掉下载中间状态与上一轮错误信息
      percent.value = 0
      errorMessage.value = ''
    }
  }

  onMounted(() => {
    // 1) 先同步订阅 live：避免 await 期间的广播事件丢失
    unsub = window.flash.on(CH.UPDATE_STATUS, (...args: unknown[]) => {
      apply(args[0] as UpdateStatus)
    })
    // 2) 后回放 cache：补齐可能错过的早期广播（不同步等是为了不阻塞同步注册）
    void window.flash.getUpdateStatus().then((cached) => {
      if (cached) apply(cached)
    })
  })

  onUnmounted(() => unsub?.())

  function check(): void {
    status.value = 'checking'
    errorMessage.value = ''
    void window.flash.checkUpdate()
  }

  function primaryAction(): void {
    // 平台分支：
    // - Mac + available：跳 releaseUrl（GitHub Releases latest），由主进程 shell.openExternal
    // - Win + available：开始下载
    // - Win + downloading：no-op（按钮已 disabled，这里防御）
    // - Win + downloaded：quitAndInstall
    if (isMac.value) {
      if (releaseUrl.value) void window.flash.openExternal(releaseUrl.value)
      return
    }
    if (status.value === 'downloading') return
    if (status.value === 'available') {
      status.value = 'downloading'
      percent.value = 0
      void window.flash.downloadUpdate()
    } else if (status.value === 'downloaded') {
      void window.flash.installUpdate()
    }
  }

  return {
    status,
    available,
    version,
    releaseUrl,
    percent,
    errorMessage,
    isMac,
    tipText,
    check,
    primaryAction
  }
}
