import { toDataURL } from 'qrcode'
import { sampleQrPayload } from '@/badges/design'

const options = {
  errorCorrectionLevel: 'M' as const,
  margin: 1,
  width: 512,
  color: { dark: '#111111', light: '#ffffff' },
}

let sample: Promise<string> | null = null

/** High-resolution preview QR. Resizing the placeholder only scales this image. */
export function sampleQrDataUrl() {
  sample ??= toDataURL(sampleQrPayload, options)
  return sample
}

/** Encodes the payload the caller supplies. The badge designer never invents a guest id. */
export function guestQrDataUrl(payload: string) {
  return toDataURL(payload, options)
}
