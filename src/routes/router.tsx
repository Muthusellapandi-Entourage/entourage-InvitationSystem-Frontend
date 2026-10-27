import { Navigate, Route, Routes } from 'react-router-dom'
import { DashboardLayout } from '@/layouts/DashboardLayout'
import { EventLayout } from '@/layouts/EventLayout'
import { CheckInPage } from '@/pages/CheckIn/CheckInPage'
import { OverviewPage } from '@/pages/Dashboard/OverviewPage'
import { CreateEventPage } from '@/pages/Events/CreateEventPage'
import { EventOverviewPage } from '@/pages/Events/EventOverviewPage'
import { EventSettingsPage } from '@/pages/Events/EventSettingsPage'
import { EventsPage } from '@/pages/Events/EventsPage'
import { BadgePage } from '@/pages/Events/BadgePage'
import { CheckInLinkPage } from '@/pages/Events/CheckInLinkPage'
import { LiveAttendancePage } from '@/pages/Events/LiveAttendancePage'
import { RsvpPage } from '@/pages/Events/RsvpPage'
import { GuestTypesPage } from '@/pages/Events/GuestTypesPage'
import { GuestsPage } from '@/pages/Events/GuestsPage'
import { InvitationPage } from '@/pages/Events/InvitationPage'
import { SeatingPage } from '@/pages/Events/SeatingPage'
import { InviteConfirmPage } from '@/pages/Invite/InviteConfirmPage'
import { FrontDeskPage } from '@/pages/Live/FrontDeskPage'
import { PublicLivePage } from '@/pages/Live/PublicLivePage'
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
      <Route path="/live/:token" element={<PublicLivePage />} />
      <Route path="/live-dashboard/:token" element={<FrontDeskPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route element={<ProtectedRoute />}>
        <Route path="events/:eventId/invitations" element={<InvitationPage />} />
        <Route path="events/:eventId/guest-types/:guestTypeId/invitation" element={<InvitationPage />} />
        <Route path="events/:eventId/badges" element={<BadgePage />} />
        <Route path="events/:eventId/seating" element={<SeatingPage />} />
        <Route path="scan/:eventId" element={<CheckInPage />} />
        <Route path="events/:eventId/guest-types/:guestTypeId/badge" element={<BadgePage />} />
        <Route element={<DashboardLayout />}>
          <Route index element={<OverviewPage />} />
          <Route path="events" element={<EventsPage />} />
          <Route path="events/create" element={<CreateEventPage />} />
          <Route path="events/:eventId" element={<EventLayout />}>
            <Route index element={<EventOverviewPage />} />
            <Route path="settings" element={<EventSettingsPage />} />
            <Route path="guest-types" element={<GuestTypesPage />} />
            <Route path="guests" element={<GuestsPage />} />
            <Route path="check-in" element={<CheckInLinkPage />} />
            <Route path="live" element={<LiveAttendancePage />} />
            <Route path="rsvp" element={<RsvpPage />} />
          </Route>
          <Route path="settings" element={<SettingsPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Route>
    </Routes>
  )
}
