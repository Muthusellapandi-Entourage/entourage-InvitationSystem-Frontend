# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Delegated by the written Phase 1 brief, then matched to this machine: React, TypeScript, and Vite in this repository; Tailwind CSS; Lucide icons; ASP.NET Core Web API on .NET 10 with Entity Framework Core and SQL Server (LocalDB `MSSQLLocalDB` for development, Azure SQL compatible). JWT authentication. The API lives in `Backend/` inside this repo.

Assumption, labeled because the brief did not name a SDK version or a local database host: .NET 10 and LocalDB are what this workstation has installed. Production secrets come from environment variables, not from committed files.

## Users

Authorized administrators of the Entourage event platform. The development administrator is addressed as Muthu and holds the Administrator role. They sign in, review every event, create and open events, edit basic event information, and activate or deactivate an event.

## Product Purpose

A master dashboard for an event invitation and e-badge platform. Phase 1 establishes authentication, event records, and the dashboard shell that later modules plug into. Success is a signed-in administrator who can create an event and land on its overview without mock data or a throwaway layout.

## Positioning

One administrator workspace that already knows an event is a container for future invitation, badge, guest, RSVP, check-in, seating, and analytics modules. Neighboring form builders do not own that event shell.

## Operating Context

Desktop-first work at a desk, with the same screens still usable on a tablet and a phone. The administrator moves from login to an overview, an event list, a create form, and an event overview. Theme follows the system on the first visit and can be set to light, dark, or system. Preference is stored on the device.

## Capabilities and Constraints

Phase 1 includes login, logout, the current-user session, an overview with simple counts and recent events, event list with search and status filters, create, edit, status change, and delete with confirmation. Event fields are name, slug (shown as event code), description, start date, end date, timezone, and status (Draft, Active, Archived).

Not in this phase: invitation designer, e-badge designer, guests, RSVP, email or SMS campaigns, QR check-in, scanner, seating, analytics, custom domains, asset storage, and billing.

Roles are an enum so more than Administrator can be added later. Only Administrator is used now. Passwords are hashed. JWT secrets and the seed administrator come from configuration. Inactive users cannot sign in.

## Brand Commitments

The product name is ENTOURAGE. The lockup reads "ENTOURAGE" and "Event Platform". The brief fixes a restrained enterprise dashboard: neutral, white, black, gray, and dark charcoal, with one subtle accent for important actions and states. Light and dark are both first-class. The brief names Linear, Vercel, Stripe Dashboard, and Notion as craft references and explicitly says not to copy them. Gradients, neon, glass, rainbow color, huge cards, and decorative motion are out.

## Evidence on Hand

No logo file, customer list, or production database was in the repository. Sample event names in the brief (Olivier Farewell, Ashraq Launch) are interface examples, not seeded production data. The development sign-in is created only from environment configuration.

## Product Principles

- The event is the unit everything later will hang from.
- Show real records and real errors. Do not invent modules that are not built.
- Keep the administrator in a fast, quiet workflow: list, open, edit, confirm.
- Security boundaries are server-side. The interface never stores a password.
- Add a module by adding a route under an event, not by redesigning the shell.

## Accessibility & Inclusion

Labeled controls, keyboard access, visible focus, accessible dialogs, and text contrast that holds in both themes. The brief requires this for the dashboard; no separate compliance standard was named.
