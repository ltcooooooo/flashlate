import { ref, type Ref } from 'vue'

export type CopyStatus = 'idle' | 'ok' | 'error'

/** 复制按钮反馈：成功 ✔ / 失败 ! 持续 1.5s 后恢复 */
export function useCopy(): { status: Ref<CopyStatus>; copy: (text: string) => Promise<void> } {
  const status = ref<CopyStatus>('idle')
  let timer: ReturnType<typeof setTimeout> | null = null

  async function copy(text: string): Promise<void> {
    if (!text) return
    if (timer) clearTimeout(timer)
    const res = await window.flash.copy(text)
    status.value = res.ok ? 'ok' : 'error'
    timer = setTimeout(() => (status.value = 'idle'), 1500)
  }

  return { status, copy }
}
