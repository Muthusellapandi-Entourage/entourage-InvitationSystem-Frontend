import { apiClient } from '@/api/client'

export type GuestGroup = {
  id: string
  name: string
  guestCount: number
  createdOn: string
  updatedOn: string
}

export type DeleteGuestGroupResult = {
  groupName: string
  guestsDeleted: number
  guestsUngrouped: number
  message: string
}

export const guestGroupApi = {
  list(eventId: string) {
    return apiClient<GuestGroup[]>(`/api/events/${eventId}/guest-groups`)
  },

  create(eventId: string, name: string) {
    return apiClient<GuestGroup>(`/api/events/${eventId}/guest-groups`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    })
  },

  rename(eventId: string, groupId: string, name: string) {
    return apiClient<GuestGroup>(`/api/events/${eventId}/guest-groups/${groupId}`, {
      method: 'PUT',
      body: JSON.stringify({ name }),
    })
  },

  /** deleteGuests = true removes the group's guests too; false keeps them without a group. */
  remove(eventId: string, groupId: string, deleteGuests: boolean) {
    return apiClient<DeleteGuestGroupResult>(`/api/events/${eventId}/guest-groups/${groupId}?deleteGuests=${deleteGuests}`, {
      method: 'DELETE',
    })
  },

  /** Move guests into a group, or out of every group with groupId = null. */
  move(eventId: string, guestIds: string[], groupId: string | null) {
    return apiClient<number>(`/api/events/${eventId}/guest-groups/move`, {
      method: 'POST',
      body: JSON.stringify({ guestIds, guestGroupId: groupId }),
    })
  },
}
