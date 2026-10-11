import { clampImagePlacement, type ImagePlacement } from '@/invitations/design'

export type PlacementMode = 'fit' | 'centered' | 'original'

/** Widest image the email table can carry. Mirrors clampImagePlacement. */
const maxImageWidth = 2400

/** Centered images that are wider than the invitation are scaled to this share of it. */
const centeredShare = 0.8

/**
 * Original size is only offered when the artwork actually fits the invitation.
 * Wider artwork would overflow the fixed-width email table (Outlook ignores
 * max-width), so the option is disabled with an explanation instead.
 */
export function originalSizeState(natural: number, canvas: number): { disabled: boolean; reason: string | null } {
  if (natural <= 0) return { disabled: true, reason: 'Waiting for the image to load.' }
  if (natural > canvas) {
    return {
      disabled: true,
      reason: `This image is ${natural}px wide, wider than the ${canvas}px invitation, so it would overflow in email. The full-width option keeps it sharp.`,
    }
  }
  if (natural === canvas) return { disabled: true, reason: 'The image is already the invitation width, so this matches the full-width option.' }
  return { disabled: false, reason: null }
}

export function detectPlacementMode(frame: ImagePlacement, canvas: number, natural: number): PlacementMode | null {
  if (frame.height !== null) return null
  if (frame.x === 0 && frame.width === canvas) return 'fit'
  if (natural > 0 && natural < canvas && frame.x === 0 && frame.width === natural) return 'original'
  if (frame.width < canvas && frame.x === Math.round((canvas - frame.width) / 2)) return 'centered'
  return null
}

export function placementFor(mode: PlacementMode, frame: ImagePlacement, canvas: number, natural: number): ImagePlacement {
  if (mode === 'fit') {
    return clampImagePlacement({ x: 0, y: frame.y, width: canvas, height: null, lockRatio: true }, canvas)
  }
  if (mode === 'original') {
    const width = Math.min(natural > 0 ? natural : frame.width, maxImageWidth, canvas)
    return clampImagePlacement({ x: 0, y: frame.y, width, height: null, lockRatio: true }, canvas)
  }
  // Centered: keep the artwork's own width when it fits, otherwise scale it
  // down so it clearly sits inside the invitation. An image the user has
  // already made narrower keeps its width and is only re-centred.
  const width =
    frame.width < canvas ? frame.width : natural > 0 && natural < canvas ? natural : Math.round(canvas * centeredShare)
  return clampImagePlacement({ x: Math.round((canvas - width) / 2), y: frame.y, width, height: null, lockRatio: true }, canvas)
}
