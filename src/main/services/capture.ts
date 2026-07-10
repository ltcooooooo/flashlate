// 截图 OCR 流程：框选 → 裁剪图片 → 调当前 OCR 引擎 → 识别文本填入弹窗触发翻译。

import { CH } from '../../shared/channels'
import { startCapture } from '../windows/overlay'
import { ocrService } from '../state'
import { fillPopup, getPopup } from '../windows/popup'

export async function captureAndOcr(): Promise<void> {
  // 規則0：当前 OCR 引擎 Key 不齐 → 提示并中止
  if (!ocrService.activeReady()) {
    fillPopup({ text: '', trigger: 'ocr', empty: true })
    notifyOcr('error', '当前 OCR 引擎未配置密钥，请在设置中配置')
    return
  }

  const imageBase64 = await startCapture()
  if (!imageBase64) return // 用户取消 / 选区太小

  // 先唤起弹窗显示"识别中"
  fillPopup({ text: '', trigger: 'ocr', empty: true })
  notifyOcr('recognizing')

  try {
    const text = await ocrService.recognize(imageBase64)
    if (!text.trim()) {
      notifyOcr('error', '未识别到文字')
      return
    }
    notifyOcr('done')
    // 填入识别文本并触发翻译
    const popup = getPopup()
    popup?.webContents.send(CH.POPUP_FILL, { text, trigger: 'ocr' })
  } catch (e) {
    notifyOcr('error', e instanceof Error ? e.message : String(e))
  }
}

function notifyOcr(state: 'recognizing' | 'done' | 'error', message?: string): void {
  const popup = getPopup()
  popup?.webContents.send(CH.OCR_STATUS, { state, message })
}
