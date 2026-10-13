import { strFromU8, unzipSync } from 'fflate'

export type SheetGrid = {
  headers: string[]
  rows: string[][]
}

export async function readSheet(file: File): Promise<SheetGrid> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.xlsx')) {
    return gridToSheet(readXlsx(new Uint8Array(await file.arrayBuffer())))
  }
  if (name.endsWith('.xls')) {
    throw new Error('Save the Excel file as .xlsx or CSV, then upload it again.')
  }
  return gridToSheet(parseCsv(await file.text()))
}

function gridToSheet(grid: string[][]): SheetGrid {
  const filled = grid.filter((row) => row.some((cell) => cell.trim().length > 0))
  if (filled.length === 0) return { headers: [], rows: [] }
  const width = Math.max(...filled.map((row) => row.length))
  const headers = Array.from({ length: width }, (_, index) => filled[0][index]?.trim() || `Column ${index + 1}`)
  const rows = filled.slice(1).map((row) => Array.from({ length: width }, (_, index) => row[index]?.trim() ?? ''))
  return { headers, rows }
}

function readXlsx(bytes: Uint8Array) {
  const files = unzipSync(bytes)
  const shared = files['xl/sharedStrings.xml']
  const strings = shared ? parseSharedStrings(strFromU8(shared)) : []
  const sheetName = Object.keys(files).find((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
  if (!sheetName) return []
  return parseSheet(strFromU8(files[sheetName]), strings)
}

function parseSharedStrings(xml: string) {
  const values: string[] = []
  const pattern = /<si\b[^>]*>([\s\S]*?)<\/si>/g
  for (const match of xml.matchAll(pattern)) {
    values.push(textFrom(match[1]))
  }
  return values
}

function parseSheet(xml: string, shared: string[]) {
  const rows: string[][] = []
  const rowPattern = /<row\b[^>]*>([\s\S]*?)<\/row>/g
  for (const rowMatch of xml.matchAll(rowPattern)) {
    const cells = new Map<number, string>()
    const cellPattern = /<c\b([^>]*)>([\s\S]*?)<\/c>|<c\b([^>]*)\/>/g
    for (const cellMatch of rowMatch[1].matchAll(cellPattern)) {
      const attrs = cellMatch[1] || cellMatch[3] || ''
      const body = cellMatch[2] ?? ''
      const ref = /r="([A-Z]+)/.exec(attrs)?.[1]
      const column = ref ? columnIndex(ref) : cells.size
      const type = /t="([^"]+)"/.exec(attrs)?.[1]
      let value = ''
      if (type === 's') {
        const index = Number(/<v>(\d+)<\/v>/.exec(body)?.[1] ?? '')
        value = shared[index] ?? ''
      } else if (type === 'inlineStr') {
        value = textFrom(body)
      } else {
        value = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? ''
      }
      cells.set(column, decodeXml(value))
    }
    if (cells.size === 0) {
      rows.push([])
      continue
    }
    const width = Math.max(...cells.keys()) + 1
    rows.push(Array.from({ length: width }, (_, index) => cells.get(index) ?? ''))
  }
  return rows
}

function textFrom(xml: string) {
  return [...xml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((match) => decodeXml(match[1])).join('')
}

function columnIndex(letters: string) {
  return [...letters].reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0) - 1
}

function decodeXml(value: string) {
  return value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&')
}

function parseCsv(text: string) {
  const source = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          cell += '"'
          index += 1
        } else {
          quoted = false
        }
      } else {
        cell += char
      }
      continue
    }
    if (char === '"') {
      quoted = true
      continue
    }
    if (char === ',') {
      row.push(cell)
      cell = ''
      continue
    }
    if (char === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
      continue
    }
    cell += char
  }
  row.push(cell)
  rows.push(row)
  return rows
}
