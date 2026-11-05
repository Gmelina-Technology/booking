<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# CourtHub: agent guide

CourtHub is a booking platform for sports facilities in the Philippines. Each partner (a
facility owner) gets a public page at `/p/@<handle>` where players book courts and register for
events. Partners run their business from `/app`. Platform admins oversee everything from `/admin`.

Start here, then read [`README.md`](README.md) for the full detail: booking lifecycle, fees,
every route, storage and deploy.

## Stack

- Next.js 16 (App Router, Cache Components, `"use cache"`), React 19, Tailwind CSS 4, TypeScript.
- Node ≥ 22.18. Vitest for tests. Deployed on Vercel (`sin1`), with Neon Postgres and Vercel Blob.
- No ORM or UI kit. Maps use MapLibre with OpenFreeMap tiles, email uses nodemailer, and QR codes use `qrcode`.

## Commands

```bash
npm install && cp .env.example .env.local   # set SESSION_SECRET
npm run dev                                 # http://localhost:3000, data in ./data (JSON files)
npm run lint
npx next typegen && npx tsc --noEmit        # typegen first, or route PageProps types are missing
npm test                                    # Vitest, no database needed
npm run build
```

CI (`.github/workflows/ci.yml`) runs all of these plus `npm audit`. Run them before you say a change is done.

## Where things live

| Path | What |
|---|---|
| `app/(platform)/` | Public platform pages: home, `/venues`, `/signup`, `/login`, `/pricing`, legal, `/bookings/[token]` |
| `app/p/[handle]/` | A partner's public page: activities, booking flow, events, QR code, poster, OG image |
| `app/q/[handle]/` | Short QR link that redirects to `/p/@handle` |
| `app/(staff)/app/` | Partner dashboard: inbox, calendar, bookings, sales, events, activities, business, billing, settings |
| `app/(staff)/admin/` | Platform admin: partners, all bookings, fees, page banners |
| `app/api/cron/` | Daily sweep (`vercel.json` cron) that releases holds and expires requests |
| `app/actions.ts`, `app/event-actions.ts`, `**/actions.ts` | Server actions |
| `lib/store.ts` | **The only data access layer.** It picks `store-file.ts` (local) or `store-postgres.ts` (`DATABASE_URL`). Types are in `store-types.ts` |
| `lib/auth.ts`, `lib/session.ts` | Sessions plus the `requireOwner()`, `requireAccountHolder()` and `requirePlatformAdmin()` guards |
| `lib/facility.ts` | Core domain types (`Activity`, `HostedEvent`, …), defaults, and platform name and operator |
| `lib/*.ts` | Domain logic, one file per topic: `fees`, `holds`, `schedule`, `sales`, `hosted-event-ops`, `emails`, `mailer`, `page-banners`, `geo`, … |
| `proxy.ts` | Sends anyone without a session from `/app` and `/admin` to login (Next 16's replacement for middleware) |
| `tests/` | Vitest tests, one per `lib` topic. Store tests use the file store in a temp folder |
| `docs/specs/` | Design specs for larger features (`YYYY-MM-DD-<name>.md`) |
| `docs/marketing/` | Customer-facing feature log (see below) |

## Rules that aren't obvious

- **All data goes through `lib/store.ts`.** Never import the file or Postgres store directly, and
  add any new operation to **both** backends.
- **Every server action and staff loader calls a guard** (`requireOwner()`, or
  `requirePlatformAdmin()` for `/admin`). `proxy.ts` alone is not enough. Everything a partner
  touches is scoped by `ownerId`.
- **Owner data is stored as JSON documents**, so new optional fields need no migration. Real
  schema changes go in `ensureSchema` in `store-postgres.ts`.
- **Caching:** reads use `"use cache"` with tags (`owners`, `activities:<id>`, `events:<id>`,
  `hero:<id>`, …). After a write, call `updateTag(...)` or the page shows stale data.
- **Double-booking** is prevented by `bookings_owner_no_overlap` in Postgres and an overlap check
  in the file store. Booking inserts can fail with `SlotTaken`.
- **Times are facility time** (`platform.timeZone` in `lib/facility.ts`, Asia/Manila). Use the helpers in `lib/time.ts`, not raw `Date` math.
- **Action results go to toasts** (`app/toaster.tsx`), not to inline messages.
- **Emails** never show addresses, paths or SMTP errors to partners (`sendMail()` returns generic
  detail). Without SMTP, mail is saved to `data/outbox/`.
- **Security headers and CSP** are in `next.config.ts`. Add any new third-party origin there.
- **Env vars** are listed in `.env.example`. `PLATFORM_ADMIN_EMAILS` controls who can open `/admin`.

## Words used in the code

- **Partner / owner**: a facility business account. `Owner` in the code, "partner" in the UI.
- **Activity**: a bookable sport at a venue, with courts, hours and pricing.
- **Booking statuses**: `pending` → `awaiting_payment` → `confirmed`, or `cancelled`. A **hold** is
  a pending or unpaid booking that gets released automatically.
- **Hosted event**: open play, a workshop or a tournament. Each registration is a booking with an `eventId`.
- **Staff booking**: a walk-in or phone booking that staff create. It's never auto-released and has no booking fee.
- **View as**: a platform admin browsing `/app` as a partner.

## Workflow

- Branch from `development` and open pull requests into **`development`**. `main` only takes release merges.
- **Every customer-visible feature** adds a page in `docs/marketing/features/` and a row at the top
  of [`docs/marketing/FEATURES.md`](docs/marketing/FEATURES.md), with its shipped date and
  `Published: —`. The format is in [`docs/marketing/README.md`](docs/marketing/README.md).
- Larger features get a spec in `docs/specs/` first.
- Update `README.md` when you add a route, env var or user-facing behaviour.
