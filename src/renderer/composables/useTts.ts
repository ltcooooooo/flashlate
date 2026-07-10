import { ref, onUnmounted, type Ref } from 'vue'

// 全局单实例播放：同一时刻只有一个发音在播。
let currentAudio: HTMLAudioElement | null = null
let stopCurrent: (() => void) | null = null

export type TtsStatus = 'idle' | 'loading' | 'playing' | 'error'

/** 停止当前正在播放/加载的发音（无论由哪个按钮发起）。用于弹窗隐藏等全局场景。 */
export function stopGlobalTts(): void {
  stopCurrent?.()
}

export function useTts(): {
  status: Ref<TtsStatus>
  toggle: (text: string) => Promise<void>
  stop: () => void
} {
  const status = ref<TtsStatus>('idle')
  let errTimer: ReturnType<typeof setTimeout> | null = null

  function stop(): void {
    if (currentAudio) {
      // 标记“主动停止/切换”：清空 src 会让浏览器异步派发 onerror，
      // 借此标记让 onerror 区分“被打断”（忽略）与“真·解码失败”（报错）。
      currentAudio.dataset.interrupted = '1'
      currentAudio.pause()
      currentAudio.src = ''
      currentAudio = null
    }
    if (status.value === 'playing' || status.value === 'loading') status.value = 'idle'
  }

  async function toggle(text: string): Promise<void> {
    // 再次点击正在播放的按钮 → 停止
    if (status.value === 'playing' || status.value === 'loading') {
      stop()
      return
    }
    if (!text.trim()) return

    // 停掉别处正在播的
    if (stopCurrent) stopCurrent()
    stopCurrent = stop

    if (errTimer) clearTimeout(errTimer)
    status.value = 'loading'
    const res = await window.flash.speak(text)
    if (!res.ok || !res.audioBase64) {
      status.value = 'error'
      errTimer = setTimeout(() => (status.value = 'idle'), 1500)
      return
    }
    try {
      const audio = new Audio('data:audio/mp3;base64,' + res.audioBase64)
      currentAudio = audio
      audio.onended = () => {
        if (currentAudio === audio) currentAudio = null
        status.value = 'idle'
      }
      audio.onerror = () => {
        // 被打断（切换/停止）触发的 onerror 直接忽略，不报错
        if (audio.dataset.interrupted) return
        status.value = 'error'
        errTimer = setTimeout(() => (status.value = 'idle'), 1500)
      }
      await audio.play()
      status.value = 'playing'
    } catch {
      status.value = 'error'
      errTimer = setTimeout(() => (status.value = 'idle'), 1500)
    }
  }

  onUnmounted(stop)
  return { status, toggle, stop }
}
