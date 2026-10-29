import jsQR from 'jsqr'
import { useCallback, useEffect, useRef, useState } from 'react'

export type CameraInfo = { deviceId: string; label: string }

type Detector = { detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]> }

/** The browser's own QR reader (Chrome on Android, Edge…); null where it is missing (Safari, Firefox). */
function nativeDetector(): Detector | null {
  const Ctor = (window as unknown as { BarcodeDetector?: new (options: { formats: string[] }) => Detector }).BarcodeDetector
  if (!Ctor) return null
  try {
    return new Ctor({ formats: ['qr_code'] })
  } catch {
    return null
  }
}

/**
 * Rear-camera QR reading for the door scanner. Reads only the centre square (72% of the shorter edge),
 * which is what the viewfinder's scan box shows. Uses the browser's QR reader when it has one, else jsQR.
 */
export function useQrCamera(onCode: (code: string) => void) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const frameRef = useRef<number | null>(null)
  const onCodeRef = useRef(onCode)
  const [cameras, setCameras] = useState<CameraInfo[]>([])
  const [cameraId, setCameraId] = useState<string>('')
  const [running, setRunning] = useState(false)
  const [status, setStatus] = useState('Camera is off.')

  useEffect(() => {
    onCodeRef.current = onCode
  }, [onCode])

  const findCameras = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setStatus('This browser cannot use the camera. Use the barcode reader instead.')
      return
    }
    const devices = await navigator.mediaDevices.enumerateDevices()
    const video = devices
      .filter((device) => device.kind === 'videoinput')
      .map((device, index) => ({ deviceId: device.deviceId, label: device.label || `Camera ${index + 1}` }))
    setCameras(video)
    if (video.length === 0) setStatus('No camera found on this device.')
    // Names appear only after camera permission; prefer a back camera when one is named.
    setCameraId((current) => current || video.find((item) => /back|rear|environment/i.test(item.label))?.deviceId || '')
  }, [])

  const stop = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    frameRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setRunning(false)
    setStatus('Camera is off.')
  }, [])

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('This browser cannot use the camera. Open the page over HTTPS, or use the barcode reader.')
      return
    }
    stop()
    setStatus('Starting camera…')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: cameraId
          ? { deviceId: { exact: cameraId }, width: { ideal: 1280 }, height: { ideal: 1280 } }
          : { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 1280 } },
      })
      streamRef.current = stream
      setRunning(true)
      // The video element renders once `running` is true; wait a few frames for it.
      for (let attempt = 0; attempt < 20 && !videoRef.current; attempt += 1) {
        await new Promise((resolve) => requestAnimationFrame(resolve))
      }
      const video = videoRef.current
      if (!video) throw new Error('no video')
      video.srcObject = stream
      await video.play()
      setStatus('Point the camera at the guest’s digital pass.')
      void findCameras()

      const detector = nativeDetector()
      const canvas = document.createElement('canvas')
      const context = canvas.getContext('2d', { willReadFrequently: true })
      let busy = false
      let last = 0
      const tick = (time: number) => {
        frameRef.current = requestAnimationFrame(tick)
        if (busy || time - last < 120 || !context || video.readyState < 2) return
        last = time
        const side = Math.floor(Math.min(video.videoWidth, video.videoHeight) * 0.72)
        if (side <= 0) return
        const size = Math.min(side, 640)
        canvas.width = size
        canvas.height = size
        context.drawImage(video, (video.videoWidth - side) / 2, (video.videoHeight - side) / 2, side, side, 0, 0, size, size)
        busy = true
        void (async () => {
          try {
            let value: string | null = null
            if (detector) {
              const found = await detector.detect(canvas)
              value = found[0]?.rawValue ?? null
            } else {
              const pixels = context.getImageData(0, 0, size, size)
              value = jsQR(pixels.data, size, size, { inversionAttempts: 'dontInvert' })?.data ?? null
            }
            if (value) onCodeRef.current(value)
          } catch {
            // A frame that cannot be read is skipped.
          } finally {
            busy = false
          }
        })()
      }
      frameRef.current = requestAnimationFrame(tick)
    } catch (error) {
      stop()
      const name = error instanceof DOMException ? error.name : ''
      setStatus(
        name === 'NotAllowedError'
          ? 'Camera permission was refused. Allow the camera for this site in the browser settings, then start again.'
          : name === 'NotFoundError' || name === 'OverconstrainedError'
            ? 'That camera is not available. Tap Find cameras and pick another.'
            : 'The camera could not start. Close other apps using it and try again.',
      )
    }
  }, [cameraId, findCameras, stop])

  useEffect(() => stop, [stop])

  return { videoRef, cameras, cameraId, setCameraId, running, status, start, stop, findCameras }
}
