# Entourage Invitation System — Architecture

Use this page as the source for a Lucidchart system diagram. Draw one page named **Architecture**.

## How to draw it in Lucidchart

1. New document → **Blank diagram**.
2. Page name: `Architecture`.
3. Turn on the grid. Use four horizontal **containers** (Lucidchart: rectangle with a light fill, no shadow), stacked top to bottom. These are layers, not swimlanes.
4. Put the boxes listed under each layer inside that container. Use **process** rectangles for components and **cylinder** shapes for data stores.
5. Draw arrows only from the connector table. Arrow labels are the text in the **Label** column. Use a dashed line for public (unauthenticated) calls.

Suggested fills:

| Layer | Fill |
| --- | --- |
| People | white |
| Browser | light blue |
| API | light green |
| Data | light gray |

## Layer 1 — People

| Shape | Text |
| --- | --- |
| Actor | Organizer |
| Actor | Guest |

## Layer 2 — Browser (React 19, Vite, TypeScript)

The SPA runs at `http://localhost:5173` in development.

| Shape | Text | Notes |
| --- | --- | --- |
| Rectangle | Login | `/login`. JWT stored in the session. |
| Rectangle | Dashboard | Events list, create event, event overview, settings, profile. Behind `ProtectedRoute`. |
| Rectangle | Invitation designer | `/events/:eventId/invitations`. Five steps: Artwork, Guest details, Event details, RSVP, Review. |
| Rectangle | Live canvas | Iframe of the email HTML, plus rulers, guides, and snap. Preview only. |
| Rectangle | Public invitation | `/invite/:slug`, `/invite/:slug/rsvp`, `/invite/:slug/confirm`. Outside `ProtectedRoute`. |

Designer state stays in React until **Save draft**. The browser builds a preview table with `src/invitations/emailHtml.ts`. The API builds the saved HTML with `InvitationEmailBuilder.cs`. Both must stay in sync. Placeholders: `{{GuestName}}`, `{{GuestPosition}}`, `{{AcceptUrl}}`, `{{DeclineUrl}}`.

## Layer 3 — API (.NET, port 5080)

| Shape | Text |
| --- | --- |
| Rectangle | Auth controller |
| Rectangle | Events controller |
| Rectangle | Invitation controller |
| Rectangle | Assets controller |
| Rectangle | Public invitation controller |
| Rectangle | Public preview controller |
| Rectangle | FluentValidation |
| Rectangle | InvitationEmailBuilder |

JWT bearer auth. Public controllers do not require a token.

| Controller | Routes |
| --- | --- |
| Auth | `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout` |
| Events | `GET/POST /api/events`, `GET/PUT/DELETE /api/events/{id}`, `PATCH /api/events/{id}/status` |
| Invitation | `GET/PUT /api/events/{id}/invitation`, `GET/PUT .../template`, `POST .../previews`, `GET .../responses` |
| Assets | `POST /api/events/{id}/assets` |
| Public assets | `GET /api/public/assets/{assetId}` |
| Public invitation | `GET /api/public/invitations/{slug}`, `POST .../{slug}/responses` |
| Public preview | `GET /api/public/previews/{token}` |

Save path: designer sends `InvitationDesign` JSON → validator → `DesignJson` stored → `InvitationEmailBuilder` writes `Html`. Preview path: same builder, HTML held in an in-memory store with an expiry. It is not written to the event template.

## Layer 4 — Data (SQL Server via EF Core)

| Shape | Text |
| --- | --- |
| Cylinder | Users |
| Cylinder | Events |
| Cylinder | EventAssets |
| Cylinder | Invitations |
| Cylinder | InvitationResponses |
| Cylinder | Preview cache (memory, not SQL) |

| Store | Holds |
| --- | --- |
| Users | Email, password hash, role, security stamp |
| Events | Name, slug, dates, timezone, status, creator |
| EventAssets | Uploaded image file name, content type, path. Referenced by id from the design. |
| Invitations | One per event. `DesignJson` (layout) and `Html` (saved email). |
| InvitationResponses | Guest name and RSVP status for a public reply |
| Preview cache | Short-lived HTML for the Preview button |

`DesignJson` includes canvas size, `backgroundColor` (`#RRGGBB` or `transparent`), guest band, image placements, asset ids, and guides. Older templates with no `backgroundColor` render as `#313131`.

## Connector table

Draw one arrow per row. Direction is **From → To**.

| From | To | Label | Line |
| --- | --- | --- | --- |
| Organizer | Login | email + password | solid |
| Login | Auth controller | POST /api/auth/login | solid |
| Auth controller | Users | verify password, issue JWT | solid |
| Organizer | Dashboard | after login | solid |
| Dashboard | Events controller | list / create / update events | solid |
| Events controller | Events | read / write | solid |
| Organizer | Invitation designer | open builder | solid |
| Invitation designer | Invitation controller | GET template | solid |
| Invitation controller | Invitations | read DesignJson | solid |
| Invitation designer | Assets controller | upload image | solid |
| Assets controller | EventAssets | store file | solid |
| Invitation designer | Live canvas | design JSON → email HTML | solid |
| Invitation designer | Invitation controller | POST preview | solid |
| Invitation controller | InvitationEmailBuilder | build HTML | solid |
| InvitationEmailBuilder | Preview cache | store expiring HTML | dashed |
| Invitation designer | Invitation controller | PUT template (Save draft) | solid |
| Invitation controller | FluentValidation | check design | solid |
| Invitation controller | Invitations | write DesignJson + Html | solid |
| Guest | Public invitation | open /invite/{slug} | dashed |
| Public invitation | Public invitation controller | GET by slug | dashed |
| Public invitation controller | Invitations | read saved Html | dashed |
| Public invitation | Public assets | image src | dashed |
| Public assets | EventAssets | file bytes | dashed |
| Guest | Public invitation controller | POST RSVP | dashed |
| Public invitation controller | InvitationResponses | insert reply | dashed |

## What is in scope vs later

In the diagram today: login, events, the five-step designer, artwork upload, guest greeting, RSVP buttons, save, guest preview, public invite page, and RSVP recording.

Not in this diagram: e-badge, guest import, outbound email sending, QR, scanner, seating, analytics.
