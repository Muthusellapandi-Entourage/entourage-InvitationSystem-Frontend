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
import { BrandKitPage } from '@/pages/Events/BrandKitPage'
import { CheckInLinkPage } from '@/pages/Events/CheckInLinkPage'
import { LiveAttendancePage } from '@/pages/Events/LiveAttendancePage'
import { RsvpPage } from '@/pages/Events/RsvpPage'
import { AnalyticsPage } from '@/pages/Events/AnalyticsPage'
import { RegistrationPage } from '@/pages/Events/RegistrationPage'
import { PrintBadgeDesignerPage } from '@/pages/Events/PrintBadgeDesignerPage'
import { KioskPage } from '@/pages/Live/KioskPage'
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
import { InvitationOnlyRoute } from '@/routes/RoleRoutes'
import { AccApplicantsPage } from '@/pages/Accreditation/AccApplicantsPage'
import { AccAuditPage } from '@/pages/Accreditation/AccAuditPage'
import { AccBadgeDesignerPage } from '@/pages/Accreditation/AccBadgeDesignerPage'
import { AccBadgesPage } from '@/pages/Accreditation/AccBadgesPage'
import { AccPrintQueuePage } from '@/pages/Accreditation/AccPrintQueuePage'
import { AccGateScannerPage } from '@/pages/Accreditation/AccGateScannerPage'
import { AccLivePage } from '@/pages/Accreditation/AccLivePage'
import { AccEventLayout } from '@/pages/Accreditation/AccEventLayout'
import { AccEventsPage } from '@/pages/Accreditation/AccEventsPage'
import { AccOrganizationsPage } from '@/pages/Accreditation/AccOrganizationsPage'
import { AccOverviewPage } from '@/pages/Accreditation/AccOverviewPage'
import { AccSetupPage } from '@/pages/Accreditation/AccSetupPage'
import { AccTeamPage } from '@/pages/Accreditation/AccTeamPage'
import { PortalInvitePage, PortalLoginPage } from '@/pages/Portal/PortalAuthPages'
import { PortalHomePage } from '@/pages/Portal/PortalHomePage'
import { PublicApplyPage } from '@/pages/Portal/PublicApplyPage'

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/invite/:slug/rsvp" element={<InviteRsvpPage />} />
      <Route path="/invite/:slug/confirm" element={<InviteConfirmPage />} />
      <Route path="/invite/:slug" element={<InvitePage />} />
      <Route path="/live/:token" element={<PublicLivePage />} />
      <Route path="/live-dashboard/:token" element={<FrontDeskPage />} />
      <Route path="/kiosk/:token" element={<KioskPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      {/* Accreditation: organisation portal and public application (own sign-in, not staff). */}
      <Route path="/portal/login" element={<PortalLoginPage />} />
      <Route path="/portal/invite/:token" element={<PortalInvitePage />} />
      <Route path="/portal" element={<PortalHomePage />} />
      <Route path="/apply/:slug" element={<PublicApplyPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<InvitationOnlyRoute />}>
          <Route path="events/:eventId/invitations" element={<InvitationPage />} />
          <Route path="events/:eventId/guest-types/:guestTypeId/invitation" element={<InvitationPage />} />
          <Route path="events/:eventId/badges" element={<BadgePage />} />
          <Route path="events/:eventId/seating" element={<SeatingPage />} />
          <Route path="scan/:eventId" element={<CheckInPage />} />
          <Route path="events/:eventId/guest-types/:guestTypeId/badge" element={<BadgePage />} />
          <Route path="events/:eventId/guest-types/:guestTypeId/print-badge" element={<PrintBadgeDesignerPage />} />
        </Route>
        <Route path="accreditation/:accEventId/badges/:templateId" element={<AccBadgeDesignerPage />} />
        <Route path="accreditation/:accEventId/scan" element={<AccGateScannerPage />} />
        <Route element={<DashboardLayout />}>
          <Route element={<InvitationOnlyRoute />}>
            <Route index element={<OverviewPage />} />
            <Route path="events" element={<EventsPage />} />
            <Route path="events/create" element={<CreateEventPage />} />
            <Route path="events/:eventId" element={<EventLayout />}>
              <Route index element={<EventOverviewPage />} />
              <Route path="settings" element={<EventSettingsPage />} />
              <Route path="brand" element={<BrandKitPage />} />
              <Route path="guest-types" element={<GuestTypesPage />} />
              <Route path="guests" element={<GuestsPage />} />
              <Route path="check-in" element={<CheckInLinkPage />} />
              <Route path="live" element={<LiveAttendancePage />} />
              <Route path="rsvp" element={<RsvpPage />} />
              <Route path="analytics" element={<AnalyticsPage />} />
              <Route path="registration" element={<RegistrationPage />} />
            </Route>
            <Route path="settings" element={<SettingsPage />} />
          </Route>
          <Route path="accreditation" element={<AccEventsPage />} />
          <Route path="accreditation/team" element={<AccTeamPage />} />
          <Route path="accreditation/:accEventId" element={<AccEventLayout />}>
            <Route index element={<AccOverviewPage />} />
            <Route path="applicants" element={<AccApplicantsPage />} />
            <Route path="organizations" element={<AccOrganizationsPage />} />
            <Route path="setup" element={<AccSetupPage />} />
            <Route path="badges" element={<AccBadgesPage />} />
            <Route path="print" element={<AccPrintQueuePage />} />
            <Route path="live" element={<AccLivePage />} />
            <Route path="audit" element={<AccAuditPage />} />
          </Route>
          <Route path="profile" element={<ProfilePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Route>
    </Routes>
  )
}
