import { Navigate, Route, Routes } from 'react-router-dom'
import { DashboardLayout } from '@/layouts/DashboardLayout'
import { EventLayout } from '@/layouts/EventLayout'
import { OverviewPage } from '@/pages/Dashboard/OverviewPage'
import { CreateEventPage } from '@/pages/Events/CreateEventPage'
import { EventOverviewPage } from '@/pages/Events/EventOverviewPage'
import { EventSettingsPage } from '@/pages/Events/EventSettingsPage'
import { EventsPage } from '@/pages/Events/EventsPage'
import { InvitationPage } from '@/pages/Events/InvitationPage'
import { InviteConfirmPage } from '@/pages/Invite/InviteConfirmPage'
import { InvitePage } from '@/pages/Invite/InvitePage'
import { InviteRsvpPage } from '@/pages/Invite/InviteRsvpPage'
import { ForgotPasswordPage } from '@/pages/Login/ForgotPasswordPage'
import { LoginPage } from '@/pages/Login/LoginPage'
import { ProfilePage } from '@/pages/Settings/ProfilePage'
import { SettingsPage } from '@/pages/Settings/SettingsPage'
import { ProtectedRoute } from '@/routes/ProtectedRoute'

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/invite/:slug/rsvp" element={<InviteRsvpPage />} />
      <Route path="/invite/:slug/confirm" element={<InviteConfirmPage />} />
      <Route path="/invite/:slug" element={<InvitePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route element={<ProtectedRoute />}>
        <Route path="events/:eventId/invitations" element={<InvitationPage />} />
        <Route element={<DashboardLayout />}>
          <Route index element={<OverviewPage />} />
          <Route path="events" element={<EventsPage />} />
          <Route path="events/create" element={<CreateEventPage />} />
          <Route path="events/:eventId" element={<EventLayout />}>
            <Route index element={<EventOverviewPage />} />
            <Route path="settings" element={<EventSettingsPage />} />
          </Route>
          <Route path="settings" element={<SettingsPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Route>
    </Routes>
  )
}
