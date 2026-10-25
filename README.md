# Courtside — booking pages for sports facilities

A booking platform where each sports facility (business owner) gets its own public page at
**`/p/@<handle>`**, with activities such as pickleball, badminton, tennis, basketball and table
tennis. Customers request a court and time slot. The owner approves it, and the system emails the
customer a QR code to pay a downpayment. Once the owner verifies the payment, the booking is
confirmed.

Built with Next.js 16 (App Router, Cache Components), React 19 and Tailwind CSS 4.

## Run it

```bash
npm install
cp .env.example .env.local   # then fill in SESSION_SECRET
npm run dev
```

Open http://localhost:3000 and click **Create your page**.

## Accounts

Each business owner has their own account and sees only their own bookings, activities, events and
settings.

- **Sign up** at `/signup`: business name, page name (the `@handle`), email and password. The
  handle is permanent because it's in the page URL: 3–30 lowercase letters, numbers or hyphens,
  with a few reserved words blocked (`admin`, `login`, …).
- **Email verification:** sign-up has a second step. We email a 6-digit code to the address given,
  and the account is only created once that code is entered, so nobody can register with an email
  they don't own. Codes last 10 minutes and allow 5 wrong tries. One IP can request 5 codes an hour,
  and one email 3 an hour. Until the code is entered, the details and password hash are held in an
  encrypted, HTTP-only cookie (`lib/signup-verification.ts`), not in the database. A hidden
  honeypot field also turns away form-filling bots. Sign-up needs working email (`SMTP_*` on the
  host). Locally, read the code from `data/outbox/`.
- **Sign in** at `/login` with email and password. Passwords are hashed with scrypt. Sessions last
  7 days in an HTTP-only cookie signed with `SESSION_SECRET`. Changing that secret signs everyone
  out. Use **Sign out** in the staff bar to end a session.
- **Staff area** at `/admin` (the same URL for everyone) shows the signed-in owner's data. The
  **Business** tab edits the name, tagline, address, phone and contact email shown on their page
  and in emails.
- **New accounts** start with the sample activities from `defaultActivities` (edit or hide them),
  no events, and new-booking alerts sent to their sign-up email.
- **Brute-force protection:** 5 wrong passwords from one IP locks that IP out for 15 minutes.
- **How it's enforced:** `proxy.ts` redirects signed-out visitors away from `/admin/*`. Every
  staff server action and admin data loader also calls `requireOwner()` (`lib/auth.ts`) and scopes
  every read and write to that owner, because server actions can be called directly without
  visiting the page. Booking changes also check that the booking belongs to the signed-in owner.
- If `SESSION_SECRET` is missing, nobody can sign up or sign in. Login fails closed.

### Upgrading from the single-business version

Data from before accounts existed (bookings with no owner, plus the old `activities`, `events` and
`settings`) is **adopted by the first account that signs up**. To keep an existing facility's data,
sign up its owner first. `STAFF_PASSWORD` is no longer used, and old staff sessions are signed out.

## Booking lifecycle

| Status | What happened | Who acts next |
|--------|---------------|---------------|
| **Pending** | Customer submitted the booking form. The slot is held. Staff get an alert email if one is set in Settings. | Staff: **Approve & send payment QR** or **Decline** |
| **Awaiting payment** | Staff approved. The customer is emailed the downpayment amount, the payment QR and a link to their private booking page. | Customer pays, then enters the payment reference on their booking page |
| **Awaiting payment** + reference | The customer says they've paid. The booking moves to **Payments to verify** in the staff inbox. | Staff check the account, then **Downpayment received** |
| **Confirmed** | Downpayment verified. The customer gets a confirmation email. The balance is paid at the front desk. | — |
| **Cancelled** | Declined or cancelled by staff, with an optional reason. The customer is emailed and the slot is freed. | — |

The staff bar shows a **"N to review"** badge for new requests and payments to verify. Bookings
still unpaid after the payment window are flagged so staff can release the slot.

### Payment & email setup

1. Sign in and open **Settings** (`/admin/settings`). Upload your GCash/Maya **Receive money QR**,
   and set the account name and number, downpayment %, payment window, and the staff alert email.
2. Set the `SMTP_*` variables and `SITE_URL` (see `.env.example`). Use **Send test email** on the
   Settings page to check delivery. Until `SMTP_HOST` is set, emails are saved as HTML files in
   `data/outbox/` instead of being sent, which is handy for previewing them in development.

Every email sent is logged on the booking. A failed send shows in red in the staff view, and
**Resend email** retries the payment request.

## Pages

| Route | What it does |
|-------|--------------|
| `/` | Platform landing page and the directory of businesses |
| `/signup` | Create an owner account and booking page |
| `/p/@[handle]` | A business's page: its activities and recent events showcase |
| `/p/@[handle]/activities/[slug]` | Booking flow: date → court → time (1–N consecutive hours) → details |
| `/bookings/[token]` | Private confirmation page. The URL holds a 32-character random token, so it can't be guessed from the short booking reference. Email and phone are masked. |
| `/login` | Owner sign-in |
| `/admin/business` | The owner's page link and the business details shown on it |
| `/admin` | Staff inbox (new requests, payments to verify, unpaid) and the day-by-day schedule |
| `/admin/settings` | Downpayment %, payment QR, account details, staff alert email, test email |
| `/admin/activities` | Staff view: add, edit, reorder, hide or delete activities |
| `/admin/events` | Staff view: past events (with photos) shown on the business page |
| `/admin/banner` | Staff view: the business page banner's template, text, photos, colours and buttons, with a live preview |

The route folders are `app/(platform)/` (platform header and footer) and `app/p/[handle]/` (the
business's own header and footer). The `@` in `/p/@handle` is optional when typed, so
`/p/courtside-hub` works too.

## Customize

The platform name, time zone, currency and booking window are in `platform` in
[`lib/facility.ts`](lib/facility.ts), shared by every business. Each business's name, address and
contact details are edited by its owner at `/admin/business`.

Staff design their page banner at `/admin/banner`. They pick one of four templates (**Collage**,
**Spotlight**, **Split**, **Minimal**), where the text sits, the headline, label and description
(`{name}` in the headline becomes the business name in the highlight colour), background and
highlight colours, photo tint and crop focus, and the buttons' style, corners, size, wording and
destination. Banner photos are uploaded into a per-owner library of up to 12. Up to 4 can be picked
and ordered, and the rest of the banner is filled with event and stock photos. The preview shows the
desktop and phone layouts. Changes go live only after **Save banner**.

Staff manage activities at `/admin/activities`. For each one they can set the name, icon, card
colour, description, price per hour, opening hours, maximum booking length, maximum players, the
list of courts or tables, and what's included. They can also hide it from customers or reorder it.
A few rules protect existing bookings:

- An activity's URL (its slug) is fixed when it's created, so links and bookings keep working after
  a rename.
- A court can't be removed while it has upcoming bookings.
- An activity with any bookings can't be deleted. Hide it instead.

`defaultActivities` in `lib/facility.ts` is only the starting set for each new account, used until
the owner saves their first change.

Each business page has a **Recent events** section showing tournaments, clinics and private events the
facility has hosted. Staff manage these at `/admin/events`, with a photo, date, activity, short
write-up and number of players. The section hides itself when there are no published events.
Photos are shrunk in the browser (at most 1600px, about 900 KB) before upload. They are stored in
`data/uploads/` and served at `/uploads/<file>`.

## How data is stored

The app reads and writes data only through [`lib/store.ts`](lib/store.ts), which picks a backend:

| | Local development | Production (Vercel) |
|---|---|---|
| Accounts, bookings, activities, events, settings | JSON files in `data/` ([`lib/store-file.ts`](lib/store-file.ts)) | Postgres when `DATABASE_URL` is set ([`lib/store-postgres.ts`](lib/store-postgres.ts)) |
| Photos and payment QR | `data/uploads/` | Vercel Blob when `BLOB_READ_WRITE_TOKEN` is set ([`lib/uploads.ts`](lib/uploads.ts)) |
| Emails without SMTP | Saved to `data/outbox/` for preview | Not sent; staff see the error |
| Login lockout counter | In memory | Postgres, shared by all instances |

Locally, `data/owners.json` holds the accounts, `data/bookings.json` every booking (each with an
`ownerId`), and `data/owners/<id>/` each owner's activities, events and settings. In Postgres,
accounts are in the `owners` table and each owner's documents use the key `owners/<id>/<kind>`.

In Postgres, a database rule (`bookings_owner_no_overlap`, an exclusion constraint) rejects any
active booking that overlaps another on the same court of the same business. Double-booking stays
impossible even with simultaneous requests across many serverless instances. The schema upgrades a
database from the single-business version on first use. On Vercel, the app refuses to start without
a database or Blob store rather than silently losing data.

The business directory and each owner's activity and event data are cached (`"use cache"` with the
`owners`, `activities:<id>` and `events:<id>` tags) and refreshed whenever an owner saves a change. If you edit the data by hand, redeploy (or restart the dev
server) to see the change.

## Deploy to Vercel

1. **Import the repo** in Vercel (framework: Next.js; defaults are fine). `vercel.json` pins
   functions to Singapore (`sin1`), the closest region to the Philippines.
2. **Add a database:** Project → **Storage** → add **Neon (Postgres)**, ideally in Singapore too. It
   sets `DATABASE_URL`. Tables are created automatically on first use, or run `npm run db:setup`
   with `DATABASE_URL` in `.env.local`.
3. **Add file storage:** Storage → create a **Blob** store and connect it. It sets
   `BLOB_READ_WRITE_TOKEN`. If you create it as private, also set `BLOB_ACCESS=private`.
4. **Set environment variables** (Settings → Environment Variables, see `.env.example`):
   `SESSION_SECRET`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`,
   `MAIL_FROM`, and `SITE_URL` once you have a custom domain. Without `SITE_URL`, email links use
   Vercel's production domain.
5. **Deploy.** The build reads the business directory from the database, so connect the database
   before the first deploy.
6. **Optional: bring over local data.** With `DATABASE_URL` and `BLOB_READ_WRITE_TOKEN` in
   `.env.local`, run `npm run db:import`. It copies accounts, bookings, each owner's documents and
   `data/uploads/*` into the production stores without overwriting anything already there.
7. Sign up at `/signup` (the first account adopts any data from the single-business version), then
   upload the payment QR in **Settings** and send a test email.

## Before going live

- **Set `SESSION_SECRET`** on the host (see `.env.example`), and serve the site over HTTPS so the
  session cookie is only sent encrypted.
- **Sign-up is open to anyone with a real email.** Emails are verified with a one-time code and
  code requests are rate-limited, but there's no password reset, CAPTCHA or platform admin yet.
  Add those before inviting the public.
- **Set up SMTP before opening sign-up.** Without it, verification codes can't be sent on Vercel
  and nobody can sign up.
- **Replace sample events.** Events marked "Sample — replace me" in `/admin/events` (from older
  installs) are placeholders. Swap in real events, or delete them.
- **Connect Postgres and Blob** in production (see [Deploy to Vercel](#deploy-to-vercel)). The JSON
  files are for local development only.
- **Set up payments and email.** Upload the payment QR in Settings, set the `SMTP_*` variables and
  `SITE_URL`, and send a test email.
- **Payments are checked by hand.** Staff match the customer's reference against the GCash/Maya
  account. For automatic confirmation, integrate a payment gateway such as PayMongo.
- **Unpaid holds aren't released automatically.** Overdue bookings are flagged and staff cancel them.
