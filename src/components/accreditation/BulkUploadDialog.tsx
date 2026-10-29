import { Download, FileSpreadsheet, Images, Loader2 } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import type { AccBulkResult, AccBulkRow, AccFile } from '@/api/accreditationApi'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { readSheet, type SheetGrid } from '@/guests/spreadsheet'
import { bulkColumns, errorMessage, guessColumn, type BulkColumnKey } from '@/components/accreditation/shared'

const templateCsv =
  'First name,Last name,Email,Mobile,Role,Nationality,Date of birth,Passport number,Applicant type,Photo\n' +
  'Sara,Ahmed,sara@example.com,+971500000000,Photographer,UAE,1990-04-12,P1234567,Media,sara.jpg\n'

/**
 * Bulk roster upload: a CSV / Excel sheet plus (optionally) the photos, matched by file name.
 * Columns are mapped automatically and can be corrected before sending.
 */
export function BulkUploadDialog({
  open,
  onClose,
  title,
  typeNames,
  upload,
  submit,
  onDone,
  extra,
}: {
  open: boolean
  onClose: () => void
  title: string
  typeNames: string[]
  upload: (file: File) => Promise<AccFile>
  submit: (rows: AccBulkRow[]) => Promise<AccBulkResult>
  onDone: (result: AccBulkResult) => void
  /** Extra controls shown at the top (e.g. which organisation the people belong to). */
  extra?: ReactNode
}) {
  const sheetInput = useRef<HTMLInputElement>(null)
  const photoInput = useRef<HTMLInputElement>(null)
  const [sheet, setSheet] = useState<SheetGrid | null>(null)
  const [fileName, setFileName] = useState('')
  const [mapping, setMapping] = useState<(BulkColumnKey | '')[]>([])
  const [photos, setPhotos] = useState<File[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<AccBulkResult | null>(null)

  function reset() {
    setSheet(null)
    setFileName('')
    setMapping([])
    setPhotos([])
    setError(null)
    setResult(null)
    setBusy(null)
  }

  async function pickSheet(file: File) {
    setError(null)
    setResult(null)
    try {
      const grid = await readSheet(file)
      if (grid.rows.length === 0) throw new Error('The file has no rows under the header.')
      setSheet(grid)
      setFileName(file.name)
      setMapping(grid.headers.map(guessColumn))
    } catch (problem) {
      setError(errorMessage(problem, 'The file could not be read.'))
    }
  }

  async function send() {
    if (!sheet) return
    const column = (key: BulkColumnKey) => mapping.indexOf(key)
    if (column('firstName') < 0 || column('lastName') < 0) {
      setError('Match the First name and Last name columns.')
      return
    }

    setError(null)
    try {
      const photoIndex = column('photo')
      const byName = new Map(photos.map((file) => [file.name.toLowerCase(), file]))
      const uploaded = new Map<string, string>()
      const rows: AccBulkRow[] = []
      for (let index = 0; index < sheet.rows.length; index++) {
        const row = sheet.rows[index]
        const read = (key: BulkColumnKey) => {
          const at = column(key)
          const text = at >= 0 ? row[at]?.trim() : ''
          return text ? text : null
        }
        let photoFileId: string | null = null
        const photoName = photoIndex >= 0 ? row[photoIndex]?.trim().toLowerCase() : ''
        if (photoName && byName.has(photoName)) {
          if (!uploaded.has(photoName)) {
            setBusy(`Uploading photos (${uploaded.size + 1})…`)
            const saved = await upload(byName.get(photoName)!)
            uploaded.set(photoName, saved.id)
          }
          photoFileId = uploaded.get(photoName) ?? null
        }
        rows.push({
          firstName: read('firstName'),
          lastName: read('lastName'),
          email: read('email'),
          phone: read('phone'),
          jobTitle: read('jobTitle'),
          nationality: read('nationality'),
          dateOfBirth: read('dateOfBirth'),
          idNumber: read('idNumber'),
          applicantType: read('applicantType'),
          photoFileId,
          customFields: null,
        })
      }
      setBusy(`Submitting ${rows.length} people…`)
      const response = await submit(rows)
      setResult(response)
      onDone(response)
    } catch (problem) {
      setError(errorMessage(problem, 'The upload failed.'))
    } finally {
      setBusy(null)
    }
  }

  const missingPhotos =
    sheet && mapping.includes('photo')
      ? sheet.rows
          .map((row) => row[mapping.indexOf('photo')]?.trim())
          .filter((name): name is string => Boolean(name) && !photos.some((file) => file.name.toLowerCase() === name!.toLowerCase())).length
      : 0

  return (
    <Modal
      open={open}
      width="lg"
      title={title}
      description="Upload a CSV or Excel (.xlsx) sheet, one person per row. Add photos named as in the Photo column."
      onClose={() => {
        if (busy) return
        reset()
        onClose()
      }}
    >
      <div className="grid gap-5">
        {extra}
        <div className="flex flex-wrap gap-2">
          <input
            ref={sheetInput}
            type="file"
            accept=".csv,.xlsx,text/csv"
            className="sr-only"
            tabIndex={-1}
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) void pickSheet(file)
            }}
          />
          <input
            ref={photoInput}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            tabIndex={-1}
            onChange={(event) => {
              const files = Array.from(event.target.files ?? [])
              event.target.value = ''
              setPhotos((current) => [...current.filter((item) => !files.some((file) => file.name === item.name)), ...files])
            }}
          />
          <Button variant="secondary" onClick={() => sheetInput.current?.click()} disabled={Boolean(busy)}>
            <FileSpreadsheet className="size-4" aria-hidden="true" />
            {sheet ? 'Choose another sheet' : 'Choose sheet'}
          </Button>
          <Button variant="secondary" onClick={() => photoInput.current?.click()} disabled={Boolean(busy)}>
            <Images className="size-4" aria-hidden="true" />
            Add photos{photos.length ? ` (${photos.length})` : ''}
          </Button>
          <a
            className="inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm text-muted hover:bg-hover hover:text-foreground"
            href={`data:text/csv;charset=utf-8,${encodeURIComponent(templateCsv)}`}
            download="accreditation-roster-template.csv"
          >
            <Download className="size-4" aria-hidden="true" />
            Template
          </a>
        </div>

        {typeNames.length ? (
          <p className="text-xs text-muted">
            Applicant type values: {typeNames.join(', ')}. Dates as YYYY-MM-DD or DD/MM/YYYY.
          </p>
        ) : null}

        {sheet ? (
          <div className="grid gap-3">
            <p className="text-sm">
              <span className="font-medium">{fileName}</span> · {sheet.rows.length} row(s)
            </p>
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-left text-sm">
                <thead className="bg-hover text-xs text-muted">
                  <tr>
                    {sheet.headers.map((header, index) => (
                      <th key={`${header}-${index}`} className="min-w-40 px-3 py-2 font-medium">
                        <span className="block truncate">{header}</span>
                        <select
                          aria-label={`Column for ${header}`}
                          className="mt-1 h-8 w-full rounded-md border border-border bg-surface px-2 text-xs text-foreground"
                          value={mapping[index] ?? ''}
                          onChange={(event) =>
                            setMapping((current) =>
                              current.map((value, at) =>
                                at === index ? (event.target.value as BulkColumnKey | '') : value === event.target.value ? '' : value,
                              ),
                            )
                          }
                        >
                          <option value="">Ignore</option>
                          {bulkColumns.map((column) => (
                            <option key={column.key} value={column.key}>
                              {column.label}
                            </option>
                          ))}
                        </select>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {sheet.rows.slice(0, 5).map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {row.map((cell, index) => (
                        <td key={index} className="max-w-56 truncate px-3 py-2 text-muted">
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {sheet.rows.length > 5 ? <p className="text-xs text-muted">Showing the first 5 rows.</p> : null}
            {missingPhotos > 0 ? (
              <p className="text-xs text-warning">{missingPhotos} row(s) name a photo that has not been added; they will be submitted without a photo.</p>
            ) : null}
          </div>
        ) : null}

        {result ? (
          <div className="rounded-md border border-border px-4 py-3 text-sm" role="status">
            <p className="font-medium text-accent">{result.created} added.</p>
            {result.errors.length ? (
              <>
                <p className="mt-2 font-medium text-danger">{result.errors.length} row(s) skipped:</p>
                <ul className="mt-1 max-h-48 list-disc overflow-y-auto pl-5 text-muted">
                  {result.errors.map((item) => (
                    <li key={`${item.row}-${item.message}`}>
                      Row {item.row}: {item.message}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            disabled={Boolean(busy)}
            onClick={() => {
              reset()
              onClose()
            }}
          >
            {result ? 'Close' : 'Cancel'}
          </Button>
          <Button onClick={() => void send()} disabled={!sheet || Boolean(busy)}>
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            {busy ?? `Submit ${sheet?.rows.length ?? 0} people`}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
