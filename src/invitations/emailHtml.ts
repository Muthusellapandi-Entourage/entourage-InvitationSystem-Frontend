import {
  canvasFill,
  effectiveGuestBand,
  effectiveImagePlacement,
  rsvpFrames,
  type GuestFieldDesign,
  type ImagePlacement,
  type InvitationDesign,
  type TextAlign,
} from '@/invitations/design'

/** Outlook honours the bgcolor attribute; other clients use the inline style. */
type Fill = { attr: string; style: string; mixBase: string }

function fillFor(design: Pick<InvitationDesign, 'backgroundColor'>): Fill {
  const color = canvasFill(design)
  return {
    attr: color ? ` bgcolor="${color}"` : '',
    style: color ? `background-color:${color};` : '',
    // Translucent name backgrounds are flattened over the canvas colour, or the
    // page colour when the canvas is transparent.
    mixBase: color ?? '#E8E8E4',
  }
}

function fontStyle(field: GuestFieldDesign) {
  const stacks: Record<string, [string, string, string]> = {
    'Manifa Bold': ["'Manifa Bold',Georgia,serif", '700', 'normal'],
    'Manifa Italic': ["'Manifa Italic',Georgia,serif", '400', 'italic'],
    Arial: ['Arial,Helvetica,sans-serif', '400', 'normal'],
    Georgia: ['Georgia,serif', '400', 'normal'],
    'Times New Roman': ["'Times New Roman',Times,serif", '400', 'normal'],
  }
  const [family, presetWeight, slant] = stacks[field.font] ?? ['Georgia,serif', '400', 'normal']
  const weight = field.weight === 'bold' ? '700' : field.weight === 'regular' ? '400' : presetWeight
  return `font-family:${family};font-size:${field.fontSize}px;font-weight:${weight};font-style:${slant};color:${field.color};line-height:1.35;`
}

function appendImage(
  src: string | null,
  alt: string,
  canvasWidth: number,
  slot: string,
  placement: ImagePlacement | null,
  fill: Fill,
) {
  if (!src) return ''
  const frame = effectiveImagePlacement(placement, canvasWidth, canvasWidth)
  const heightAttribute = frame.height ? ` height="${frame.height}"` : ''
  const heightStyle = frame.height ? `height:${frame.height}px;` : 'height:auto;'
  return `<tr data-image-slot="${slot}"><td${fill.attr} style="${fill.style}padding:0;line-height:0;font-size:0;"><table role="presentation" width="${canvasWidth}" cellpadding="0" cellspacing="0" border="0" style="width:${canvasWidth}px;border-collapse:collapse;"><tr><td data-image-y="${slot}" colspan="3" height="${frame.y}" style="height:${frame.y}px;font-size:0;line-height:0;mso-line-height-rule:exactly;">&nbsp;</td></tr><tr><td data-image-x="${slot}" width="${frame.x}" style="width:${frame.x}px;font-size:0;line-height:0;">&nbsp;</td><td width="${frame.width}" style="width:${frame.width}px;"><img data-image-slot="${slot}" src="${src}" alt="${alt}" width="${frame.width}"${heightAttribute} style="display:block;width:${frame.width}px;max-width:100%;${heightStyle}border:0;" /></td><td style="font-size:0;line-height:0;">&nbsp;</td></tr></table></td></tr>`
}

function appendGuest(design: InvitationDesign, fill: Fill) {
  if (!design.guestName.enabled && !design.guestPosition.enabled) return ''
  const band = effectiveGuestBand(design)
  const align = band.align
  const width = design.width
  const lines = [
    design.guestName.enabled
      ? guestLine('guest-name', 'inv-guest-name', align, band.inset, 0, 'Dear <span data-dynamic-tag="GuestName">{{GuestName}}</span>,', design.guestName, true, fill.mixBase)
      : '',
    design.guestPosition.enabled
      ? guestLine('guest-position', 'inv-guest-position', align, band.inset, band.spacing, '{{GuestPosition}}', design.guestPosition, false, fill.mixBase)
      : '',
  ].join('')
  const spacer = `<tr data-guest-band="spacer"><td height="${band.y}" style="height:${band.y}px;font-size:0;line-height:0;mso-line-height-rule:exactly;">&nbsp;</td></tr>`
  return `${spacer}<tr data-guest-band="true"><td data-guest-band-cell="true" width="${width}" height="${band.height}" align="${align}" valign="${band.valign}" style="width:${width}px;height:${band.height}px;"><table role="presentation" width="${width}" cellpadding="0" cellspacing="0" border="0" align="center" style="width:${width}px;border-collapse:collapse;">${lines}</table></td></tr>`
}

function guestLine(
  marker: string,
  cssClass: string,
  align: TextAlign,
  inset: number,
  spacing: number,
  content: string,
  field: GuestFieldDesign,
  allowBackground: boolean,
  mixBase: string,
) {
  const position = marker === 'guest-position'
  const row = position ? ' data-guest-position="true"' : ''
  const tag = position ? ' data-dynamic-tag="GuestPosition"' : ''
  const span = `<span class="${cssClass}"${tag} style="${fontStyle(field)}">${content}</span>`
  const fill = allowBackground ? nameFill(field, mixBase) : null
  const inner = fill
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="${align}" style="border-collapse:collapse;"><tr><td bgcolor="${fill.solid}" style="background-color:${fill.css};padding:${field.padY}px ${field.padX}px;">${span}</td></tr></table>`
    : span
  return `<tr${row}><td data-${marker}="true" align="${align}" style="padding:${spacing}px ${inset}px 0;text-align:${align};">${inner}</td></tr>`
}

function nameFill(field: GuestFieldDesign, mixBase: string) {
  if (!field.nameBackground || !field.backgroundColor || field.backgroundOpacity <= 0) return null
  const opacity = Math.min(100, Math.max(0, Math.round(field.backgroundOpacity)))
  return {
    solid: opacity >= 100 ? field.backgroundColor : mixOver(field.backgroundColor, mixBase, opacity),
    css: opacity >= 100 ? field.backgroundColor : hexToRgba(field.backgroundColor, opacity),
  }
}

function mixOver(hex: string, baseHex: string, opacity: number) {
  const source = hexRgb(hex)
  const base = hexRgb(baseHex)
  const amount = opacity / 100
  const channel = (value: number, under: number) => Math.round(value * amount + under * (1 - amount))
  return rgbHex(channel(source.r, base.r), channel(source.g, base.g), channel(source.b, base.b))
}

function hexToRgba(hex: string, opacity: number) {
  const { r, g, b } = hexRgb(hex)
  return `rgba(${r},${g},${b},${opacity / 100})`
}

function hexRgb(hex: string) {
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  }
}

function rgbHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, '0')).join('').toUpperCase()}`
}

function appendButtons(design: InvitationDesign, fill: Fill) {
  const width = design.width
  const frames = rsvpFrames(design)
  const items = [
    frames.accept
      ? { slot: 'accept', src: `/api/public/assets/${design.acceptAssetId}`, href: '{{AcceptUrl}}', alt: 'Accept invitation', frame: frames.accept }
      : null,
    frames.decline
      ? { slot: 'decline', src: `/api/public/assets/${design.declineAssetId}`, href: '{{DeclineUrl}}', alt: 'Decline invitation', frame: frames.decline }
      : null,
  ].filter((item): item is { slot: string; src: string; href: string; alt: string; frame: ImagePlacement } => item !== null)
  if (!items.length) return ''
  items.sort((left, right) => left.frame.x - right.frame.x || left.slot.localeCompare(right.slot))
  let cursor = 0
  const cells = items
    .map((item) => {
      const gap = Math.max(0, item.frame.x - cursor)
      cursor += gap + item.frame.width
      const heightAttribute = item.frame.height ? ` height="${item.frame.height}"` : ''
      const heightStyle = item.frame.height ? `height:${item.frame.height}px;` : 'height:auto;'
      return `<td data-image-gap="${item.slot}" width="${gap}" style="width:${gap}px;font-size:0;line-height:0;">&nbsp;</td><td data-image-pad="${item.slot}" width="${item.frame.width}" valign="top" style="width:${item.frame.width}px;padding:${item.frame.y}px 0 0 0;line-height:0;font-size:0;"><a href="${item.href}" target="_top" style="text-decoration:none;"><img data-image-slot="${item.slot}" data-canvas-x="${item.frame.x}" data-canvas-y="${item.frame.y}" src="${item.src}" alt="${item.alt}" width="${item.frame.width}"${heightAttribute} style="display:block;width:${item.frame.width}px;${heightStyle}border:0;" /></a></td>`
    })
    .join('')
  return `<tr><td${fill.attr} style="${fill.style}padding:0;line-height:0;font-size:0;"><table role="presentation" width="${width}" cellpadding="0" cellspacing="0" border="0" style="width:${width}px;border-collapse:collapse;"><tr data-rsvp-row="true">${cells}<td style="font-size:0;line-height:0;">&nbsp;</td></tr></table></td></tr>`
}

export function buildInvitationTable(design: InvitationDesign) {
  const width = design.width
  const height = design.height
  const fill = fillFor(design)
  const header = appendImage(design.headerAssetId ? `/api/public/assets/${design.headerAssetId}` : null, 'Header', width, 'header', design.headerImage, fill)
  const guest = appendGuest(design, fill)
  const details = appendImage(design.detailsAssetId ? `/api/public/assets/${design.detailsAssetId}` : null, 'Event information', width, 'details', design.detailsImage, fill)
  const buttons = appendButtons(design, fill)
  const empty = header || guest || details || buttons
    ? height && !guest
      ? `<tr><td${fill.attr} height="100%" style="height:100%;${fill.style}font-size:0;line-height:0;">&nbsp;</td></tr>`
      : ''
    : `<tr><td${fill.attr} style="height:${height ? '100%' : '120px'};${fill.style}font-size:0;line-height:0;">&nbsp;</td></tr>`
  const heightAttribute = height ? ` height="${height}"` : ''
  const heightStyle = height ? `height:${height}px;` : ''
  const shrink = height ? '' : 'max-width:100%;'
  return `<table data-invitation-canvas="true" role="presentation" width="${width}"${heightAttribute} cellpadding="0" cellspacing="0" border="0" align="center"${fill.attr} style="width:${width}px;${heightStyle}${shrink}border-collapse:collapse;${fill.style}margin:0 auto;">${header}${guest}${details}${buttons}${empty}</table>`
}

export function wrapInvitationPreview(canvas: string, design: InvitationDesign) {
  return wrapInvitationDocument(canvas, design).replace(
    'body style="margin:0;padding:32px 16px;background:#e8e8e4;"',
    'body style="margin:0;overflow:hidden;background:#e8e8e4;"',
  )
}

export function wrapInvitationDocument(table: string, design: InvitationDesign) {
  const rules = [
    design.guestName.enabled ? `.inv-guest-name{font-size:${design.guestName.mobileFontSize}px !important;}` : '',
    design.guestPosition.enabled ? `.inv-guest-position{font-size:${design.guestPosition.mobileFontSize}px !important;}` : '',
  ].join('')
  const style = rules ? `<style>@media only screen and (max-width:600px){${rules}}</style>` : ''
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Invitation</title>
${style}
</head>
<body style="margin:0;padding:32px 16px;background:#e8e8e4;">
${table}
</body>
</html>`
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

/** True for single-image designs, where each guest's name is a generated image. */
export function usesGuestNameImage(html: string) {
  return html.includes('{{GuestNameImage}}')
}

export function renderInvitationHtml(
  html: string,
  options: {
    guestName: string
    guestPosition: string
    acceptUrl: string
    declineUrl: string
    assetOrigin: string
    /** Single-image designs: the guest's own name image (URL or data: URL). */
    nameImage?: string
    /** Text shown when images are blocked; defaults to "Dear <name>,". */
    nameImageAlt?: string
  },
) {
  let output = html
  if (usesGuestNameImage(output)) {
    output = output.replaceAll('{{GuestNameImage}}', escapeHtml(options.nameImage ?? ''))
    output = output.replaceAll('{{GuestNameAlt}}', escapeHtml(options.nameImageAlt ?? `Dear ${options.guestName},`))
  }
  if (options.assetOrigin) {
    output = output.replaceAll('src="/api/public/assets/', `src="${options.assetOrigin}/api/public/assets/`)
  }
  output = output.replaceAll('{{GuestName}}', escapeHtml(options.guestName))
  output = output.replaceAll('{{AcceptUrl}}', escapeHtml(options.acceptUrl))
  output = output.replaceAll('{{DeclineUrl}}', escapeHtml(options.declineUrl))
  if (!options.guestPosition.trim()) {
    output = output.replace(/<tr data-guest-position="true"[\s\S]*?<\/tr>/g, '')
    output = output.replace(/<tr>\s*<td[^>]*>\s*<div data-guest-position="true"[\s\S]*?<\/div>\s*<\/td>\s*<\/tr>/g, '')
    output = output.replace(/<div data-guest-position="true"[\s\S]*?<\/div>/g, '')
  } else {
    output = output.replaceAll('{{GuestPosition}}', escapeHtml(options.guestPosition))
  }
  return output
}
