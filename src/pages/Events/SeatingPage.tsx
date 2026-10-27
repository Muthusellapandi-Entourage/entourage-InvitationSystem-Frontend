import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Link, useBlocker, useParams } from 'react-router-dom'
import { LeaveDialog } from '@/components/seating/LeaveDialog'
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

function persistedLayoutIds(saved: string) {
  try {
    const parsed = JSON.parse(saved) as { layouts?: { id?: string }[] }
    return (parsed.layouts ?? []).flatMap((layout) => (typeof layout.id === 'string' ? [layout.id] : []))
  } catch {
    return []
  }
}

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

  const dirty = design !== null && JSON.stringify(design) !== saved
  const [leaveError, setLeaveError] = useState<string | null>(null)
  // Any in-app exit (header links, sidebar, browser back/forward) with unsaved changes asks first.
  // Moving within the same page (e.g. a query string change) is not an exit.
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname)

  async function saveAndLeave() {
    if (!design || blocker.state !== 'blocked') return
    setLeaveError(null)
    try {
      await saveMutation.mutateAsync(design)
      blocker.proceed()
    } catch (error) {
      setLeaveError(error instanceof ApiError ? error.message : 'The layout could not be saved. You can try again or leave without saving.')
    }
  }

  function adopt(plan:{ designJson: string | null; updatedOn: string | null }, message: string) {
    const next = parseDesign(plan.designJson)
    applied.current = plan.updatedOn ?? 'empty'
    setDesign(next)
    setSaved(JSON.stringify(next))
    past.current = []
    future.current = []
    setHistory({ undo: false, redo: false })
    queryClient.setQueryData(['seating', eventId], plan)
    toast.success(message)
  }

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

  function preview(next: SeatingDesign) {
    setDesign(next)
  }

  function commitFrom(before: SeatingDesign, after: SeatingDesign) {
    past.current.push(before)
    if (past.current.length > 80) past.current.shift()
    future.current = []
    setDesign(after)
    setHistory({ undo: true, redo: false })
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
    <>
    <LeaveDialog
      open={blocker.state === 'blocked'}
      saving={saveMutation.isPending}
      error={leaveError}
      onSave={() => void saveAndLeave()}
      onDiscard={() => {
        setLeaveError(null)
        if (blocker.state === 'blocked') blocker.proceed()
      }}
      onStay={() => {
        setLeaveError(null)
        if (blocker.state === 'blocked') blocker.reset()
      }}
    />
    <SeatingDesigner
      eventId={event.id}
      eventName={event.name}
      guests={guestQuery.data ?? []}
      design={design}
      dirty={dirty}
      saving={saveMutation.isPending}
      onChange={commit}
      onPreview={preview}
      onCommitFrom={commitFrom}
      onSave={() => saveMutation.mutate(design)}
      canUndo={history.undo}
      canRedo={history.redo}
      persistedLayoutIds={persistedLayoutIds(saved)}
      onDeleteLayout={async (layoutId) => {
        const plan = await seatingApi.deleteLayout(eventId, layoutId)
        adopt(plan, 'Layout deleted.')
      }}
      onResetLayout={async (layoutId) => {
        const plan = await seatingApi.resetLayout(eventId, layoutId)
        adopt(plan, 'Layout reset.')
      }}
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
    </>
  )
}
