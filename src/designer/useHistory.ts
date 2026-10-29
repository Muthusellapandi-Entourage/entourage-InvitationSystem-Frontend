import { useCallback, useRef, useState } from 'react'

type State<T> = { past: T[]; present: T; future: T[] }

const LIMIT = 100

/**
 * Undo / redo for a design. `commit` adds an undo step; `live` changes the design without one (while
 * dragging) and `settle(before)` then records the step once the drag ends.
 */
export function useHistory<T>(initial: T) {
  const [state, setState] = useState<State<T>>({ past: [], present: initial, future: [] })
  const presentRef = useRef(state.present)
  presentRef.current = state.present

  const commit = useCallback((next: T | ((current: T) => T)) => {
    setState((current) => {
      const value = typeof next === 'function' ? (next as (current: T) => T)(current.present) : next
      if (Object.is(value, current.present)) return current
      return { past: [...current.past.slice(-LIMIT), current.present], present: value, future: [] }
    })
  }, [])

  const live = useCallback((next: T | ((current: T) => T)) => {
    setState((current) => ({ ...current, present: typeof next === 'function' ? (next as (current: T) => T)(current.present) : next }))
  }, [])

  /** Records the state before a drag as one undo step (when something changed). */
  const settle = useCallback((before: T) => {
    setState((current) =>
      Object.is(before, current.present) || JSON.stringify(before) === JSON.stringify(current.present)
        ? current
        : { past: [...current.past.slice(-LIMIT), before], present: current.present, future: [] },
    )
  }, [])

  const undo = useCallback(() => {
    setState((current) =>
      current.past.length === 0
        ? current
        : { past: current.past.slice(0, -1), present: current.past[current.past.length - 1], future: [current.present, ...current.future] },
    )
  }, [])

  const redo = useCallback(() => {
    setState((current) =>
      current.future.length === 0 ? current : { past: [...current.past, current.present], present: current.future[0], future: current.future.slice(1) },
    )
  }, [])

  /** Starts over from a value (after loading or saving), clearing undo. */
  const reset = useCallback((value: T) => setState({ past: [], present: value, future: [] }), [])

  return {
    present: state.present,
    /** The latest value, also inside callbacks created earlier. */
    current: () => presentRef.current,
    commit,
    live,
    settle,
    undo,
    redo,
    reset,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  }
}

export type History<T> = ReturnType<typeof useHistory<T>>
