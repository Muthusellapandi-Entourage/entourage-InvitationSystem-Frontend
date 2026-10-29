import { Navigate, Outlet } from 'react-router-dom'
import { isAccreditationOnly } from '@/components/accreditation/shared'
import { useAuth } from '@/stores/authStore'

/** The invitation system is for Administrators only; accreditation roles are sent to accreditation. */
export function InvitationOnlyRoute() {
  const { user } = useAuth()
  if (isAccreditationOnly(user?.role)) return <Navigate to="/accreditation" replace />
  return <Outlet />
}
