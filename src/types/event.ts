export type EventStatus = 'Draft' | 'Active' | 'Archived'

export type EventItem = {
  id: string
  name: string
  slug: string
  description: string | null
  startDate: string
  endDate: string
  timezone: string
  status: EventStatus
  isActive: boolean
  createdBy: string
  createdOn: string
  updatedOn: string
}

export type EventInput = {
  name: string
  slug: string
  description: string | null
  startDate: string
  endDate: string
  timezone: string
  status: EventStatus
}
