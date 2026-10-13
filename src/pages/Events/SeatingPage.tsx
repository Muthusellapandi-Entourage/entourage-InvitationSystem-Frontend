import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ApiError } from '@/api/client'
import { guestApi } from '@/api/guestApi'
import { seatingApi } from '@/api/seatingApi'
import { SeatingDesigner } from '@/components/seating/SeatingDesigner'
import { buttonClassName } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useEvent } from '@/hooks/useEvents'
import { parseDesign, type SeatingDesign } from '@/seating/model'

export function SeatingPage() {
  const { eventId = '' } = useParams()
  const eventQuery = useEvent(eventId)
  const event = eventQuery.data
  const queryClient = useQueryClient()
  const planQuery = useQuery({
    queryKey: ['seating', eventId],
    queryFn: () => seatingApi.get(eventId),
    enabled: Boolean(eventId),
  })
  const guestQuery = useQuery({
    queryKey: ['guests', eventId],
    queryFn: () => guestApi.list(eventId),
    enabled: Boolean(eventId),
  })
  const [design, setDesign] = useState<SeatingDesign | null>(null)
  const [saved, setSaved] = useState('')
  const past = useRef<SeatingDesign[]>([])
  const future = useRef<SeatingDesign[]>([])
  const [history, setHistory] = useState({ undo: false, redo: false })
  const applied = useRef<string | null>(null)
  useDocumentTitle(event ? `${event.name} seating` : 'Seating')

  useEffect(() => {
    if (!planQuery.data || !event) return
    const key = planQuery.data.updatedOn ?? 'empty'
    if (applied.current === key) return
    const next = parseDesign(planQuery.data.designJson)
    applied.current = key
    setDesign(next)
    setSaved(JSON.stringify(next))
    past.current = []
    future.current = []
    setHistory({ undo: false, redo: false })
  }, [planQuery.data, event])

  useEffect(() => {
    if (!design || JSON.stringify(design) === saved) return
    const onLeave = (leave: BeforeUnloadEvent) => leave.preventDefault()
    window.addEventListener('beforeunload', onLeave)
    return () => window.removeEventListener('beforeunload', onLeave)
  }, [design, saved])

  const saveMutation = useMutation({
    mutationFn: (current: SeatingDesign) => seatingApi.save(eventId, JSON.stringify(current)),
    onSuccess: async (savedPlan) => {
      const next = parseDesign(savedPlan.designJson)
      applied.current = savedPlan.updatedOn ?? 'empty'
      setDesign(next)
      setSaved(JSON.stringify(next))
      toast.success('Seating layout saved.')
      await queryClient.invalidateQueries({ queryKey: ['seating', eventId] })
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'The layout could not be saved.')
    },
  })

  function commit(next: SeatingDesign) {
    setDesign((current) => {
      if (!current) return next
      past.current.push(current)
      if (past.current.length > 80) past.current.shift()
      future.current = []
      setHistory({ undo: true, redo: false })
      return next
    })
  }

  if (eventQuery.isLoading || planQuery.isLoading) {
    return <p className="p-6 text-sm text-muted">Loading seating…</p>
  }

  if (eventQuery.isError || !event || planQuery.isError || !design) {
    return (
      <div className="p-6">
        <EmptyState
          title="Seating could not be loaded"
          description="The floor plan for this event is unavailable."
          action={
            <Link to="/events" className={buttonClassName('secondary')}>
              Back to events
            </Link>
          }
        />
      </div>
    )
  }

  return (
    <SeatingDesigner
      eventId={event.id}
      eventName={event.name}
      guests={guestQuery.data ?? []}
      design={design}
      dirty={JSON.stringify(design) !== saved}
      saving={saveMutation.isPending}
      onChange={commit}
      onSave={() => saveMutation.mutate(design)}
      canUndo={history.undo}
      canRedo={history.redo}
      onUndo={() => {
        const previous = past.current.pop()
        if (!previous) return
        setDesign((current) => {
          if (current) future.current.push(current)
          return previous
        })
        setHistory({ undo: past.current.length > 0, redo: true })
      }}
      onRedo={() => {
        const next = future.current.pop()
        if (!next) return
        setDesign((current) => {
          if (current) past.current.push(current)
          return next
        })
        setHistory({ undo: true, redo: future.current.length > 0 })
      }}
    />
  )
}
