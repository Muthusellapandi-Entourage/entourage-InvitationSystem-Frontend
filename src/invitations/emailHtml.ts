import type { GuestFieldDesign, InvitationDesign } from '@/invitations/design'

function fontStyle(field: GuestFieldDesign) {
  const stacks: Record<string, [string, string, string]> = {
    'Manifa Bold': ["'Manifa Bold',Georgia,serif", '700', 'normal'],
    'Manifa Italic': ["'Manifa Italic',Georgia,serif", '400', 'italic'],
    Arial: ['Arial,Helvetica,sans-serif', '400', 'normal'],
    Georgia: ['Georgia,serif', '400', 'normal'],
    'Times New Roman': ["'Times New Roman',Times,serif", '400', 'normal'],
  }
  const [family, weight, slant] = stacks[field.font] ?? ['Georgia,serif', '400', 'normal']
  return `font-family:${family};font-size:${field.fontSize}px;font-weight:${weight};font-style:${slant};color:${field.color};line-height:1.35;`
}

function appendImage(src: string | null, alt: string, width: number) {
  if (!src) return ''
  return `<tr><td style="background:#313131;padding:0;line-height:0;font-size:0;"><img src="${src}" alt="${alt}" width="${width}" style="display:block;width:100%;max-width:${width}px;height:auto;border:0;" /></td></tr>`
}

function appendGuest(design: InvitationDesign) {
  if (!design.guestName.enabled && !design.guestPosition.enabled) return ''
  let inner = ''
  if (design.guestName.enabled) {
    const field = design.guestName
    inner += `<div data-guest-name="true" style="padding:${field.topSpacing}px 32px 0 ${field.leftPadding}px;text-align:${field.alignment};"><span class="inv-guest-name" style="display:block;${fontStyle(field)}">Dear <span data-dynamic-tag="GuestName">{{GuestName}}</span>,</span></div>`
  }
  if (design.guestPosition.enabled) {
    const field = design.guestPosition
    inner += `<div data-guest-position="true" style="padding:${field.topSpacing}px 32px 0 ${field.leftPadding}px;text-align:${field.alignment};"><span class="inv-guest-position" data-dynamic-tag="GuestPosition" style="display:block;${fontStyle(field)}">{{GuestPosition}}</span></div>`
  }
  return `<tr><td style="background:#313131;padding:0 0 28px;">${inner}</td></tr>`
}

function appendButton(src: string | null, href: string, alt: string) {
  if (!src) return ''
  return `<td style="padding:0 10px;"><a href="${href}" target="_top" style="text-decoration:none;"><img src="${src}" alt="${alt}" style="display:block;border:0;height:auto;max-width:220px;" /></a></td>`
}

function appendButtons(design: InvitationDesign) {
  const accept = design.acceptAssetId ? `/api/public/assets/${design.acceptAssetId}` : null
  const decline = design.declineAssetId ? `/api/public/assets/${design.declineAssetId}` : null
  if (!accept && !decline) return ''
  return `<tr><td style="background:#313131;padding:28px 16px 36px;text-align:center;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="border-collapse:collapse;margin:0 auto;"><tr>${appendButton(accept, '{{AcceptUrl}}', 'Accept invitation')}${appendButton(decline, '{{DeclineUrl}}', 'Decline invitation')}</tr></table></td></tr>`
}

export function buildInvitationTable(design: InvitationDesign) {
  const header = appendImage(design.headerAssetId ? `/api/public/assets/${design.headerAssetId}` : null, 'Header', 560)
  const guest = appendGuest(design)
  const details = appendImage(design.detailsAssetId ? `/api/public/assets/${design.detailsAssetId}` : null, 'Event information', 560)
  const buttons = appendButtons(design)
  const empty = header || guest || details || buttons ? '' : '<tr><td style="height:120px;background:#313131;font-size:0;line-height:0;">&nbsp;</td></tr>'
  return `<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" align="center" style="width:560px;max-width:100%;border-collapse:collapse;background:#313131;margin:0 auto;">${header}${guest}${details}${buttons}${empty}</table>`
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

export function renderInvitationHtml(
  html: string,
  options: {
    guestName: string
    guestPosition: string
    acceptUrl: string
    declineUrl: string
    assetOrigin: string
  },
) {
  let output = html
  if (options.assetOrigin) {
    output = output.replaceAll('src="/api/public/assets/', `src="${options.assetOrigin}/api/public/assets/`)
  }
  output = output.replaceAll('{{GuestName}}', escapeHtml(options.guestName))
  output = output.replaceAll('{{AcceptUrl}}', escapeHtml(options.acceptUrl))
  output = output.replaceAll('{{DeclineUrl}}', escapeHtml(options.declineUrl))
  if (!options.guestPosition.trim()) {
    output = output.replace(/<div data-guest-position="true"[\s\S]*?<\/div>/g, '')
  } else {
    output = output.replaceAll('{{GuestPosition}}', escapeHtml(options.guestPosition))
  }
  return output
}
