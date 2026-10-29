/** Natural pixel size of an image URL (cached). Null when it can't be loaded. */
const cache = new Map<string, Promise<{ width: number; height: number } | null>>()

export function naturalSize(url: string) {
  let found = cache.get(url)
  if (!found) {
    found = new Promise((resolve) => {
      const image = new Image()
      image.crossOrigin = 'anonymous'
      image.onload = () => resolve(image.naturalWidth > 0 && image.naturalHeight > 0 ? { width: image.naturalWidth, height: image.naturalHeight } : null)
      image.onerror = () => resolve(null)
      image.src = url
    })
    cache.set(url, found)
  }
  return found
}

/** The largest box with the image's proportions that fits inside maxW × maxH. */
export function fitInside(natural: { width: number; height: number }, maxW: number, maxH: number) {
  const scale = Math.min(maxW / natural.width, maxH / natural.height)
  return { w: natural.width * scale, h: natural.height * scale }
}
