import type { FlashApi } from './index'

declare global {
  interface Window {
    flash: FlashApi
  }
}
