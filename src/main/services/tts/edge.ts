// Edge TTS 发音（免费、无需 Key）。移植自 api-verify/src/edge-tts.js。
// 务必用 msedge-tts v2（v1 不支持微软 Sec-MS-GEC 令牌校验）。
// 主进程合成 MP3 → base64 给渲染层 Audio 播放（便于声波动效与中断）。

import type { TtsVoice } from '../../../shared/types'

// msedge-tts 是 CommonJS
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts')

let voicesCache: TtsVoice[] | null = null

export async function listVoices(): Promise<TtsVoice[]> {
  if (voicesCache) return voicesCache
  const tts = new MsEdgeTTS()
  const voices = await tts.getVoices()
  voicesCache = voices.map((v: { ShortName: string; Locale: string; Gender: string }) => ({
    shortName: v.ShortName,
    locale: v.Locale,
    gender: v.Gender
  }))
  return voicesCache!
}

/** 合成语音，返回 mp3 的 base64 */
export async function synthesize(text: string, voice: string): Promise<string> {
  const tts = new MsEdgeTTS()
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)

  return await new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = []
    let done = false
    const { audioStream } = tts.toStream(text)
    const finish = (): void => {
      if (done) return
      done = true
      const buf = Buffer.concat(chunks)
      if (buf.length === 0) return reject(new Error('未收到音频数据（网络无法访问微软 TTS）'))
      resolve(buf.toString('base64'))
    }
    audioStream.on('data', (d: Buffer) => chunks.push(d))
    audioStream.on('end', finish)
    audioStream.on('close', finish)
    audioStream.on('error', (e: Error) => reject(e))
  })
}
