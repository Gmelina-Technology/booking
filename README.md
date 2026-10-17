# Courtside Hub — facility booking site

A booking website for a sports facility with several activities (pickleball, badminton, tennis,
basketball, table tennis). Customers request a court and time slot. Staff approve it, and the
system emails the customer a QR code to pay a downpayment. Once staff verify the payment, the
booking is confirmed.

Built with Next.js 16 (App Router, Cache Components), React 19 and Tailwind CSS 4.

## Run it

```bash
npm install
cp .env.example .env.local   # then fill in STAFF_PASSWORD and SESSION_SECRET
npm run dev
```

Open http://localhost:3000.

## Staff access

The staff area isn't linked from the public site. Staff go to **`/admin`** directly (bookmark it),
for example `https://your-domain.com/admin`. Anyone not signed in is sent to `/login`.

- **Login:** one shared staff password, set with the `STAFF_PASSWORD` environment variable. Sessions
  last 7 days in an HTTP-only cookie signed with `SESSION_SECRET`. Use the **Sign out** button in
  the staff bar to end one.
- **Changing the password:** update `STAFF_PASSWORD` and restart. To sign everyone out as well,
  also change `SESSION_SECRET`.
- **Brute-force protection:** 5 wrong passwords from one IP locks that IP out for 15 minutes.
- **How it's enforced:** `proxy.ts` redirects signed-out visitors away from `/admin/*`. Every
  staff server action and admin data loader also calls `requireStaff()` (`lib/auth.ts`), because
  server actions can be called directly without visiting the page.
- If either variable is missing, nobody can sign in. Login fails closed.

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
| `/` | Landing page, the activity list and the recent events showcase |
| `/activities/[slug]` | Booking flow: date → court → time (1–N consecutive hours) → details |
| `/bookings/[token]` | Private confirmation page. The URL holds a 32-character random token, so it can't be guessed from the short booking reference. Email and phone are masked. |
| `/login` | Staff sign-in |
| `/admin` | Staff inbox (new requests, payments to verify, unpaid) and the day-by-day schedule |
| `/admin/settings` | Downpayment %, payment QR, account details, staff alert email, test email |
| `/admin/activities` | Staff view: add, edit, reorder, hide or delete activities |
| `/admin/events` | Staff view: past events (with photos) shown on the home page |

## Customize for a client

The facility name, address, contact details, time zone, currency and booking window are in
[`lib/facility.ts`](lib/facility.ts).

Staff manage activities at `/admin/activities`. For each one they can set the name, icon, card
colour, description, price per hour, opening hours, maximum booking length, maximum players, the
list of courts or tables, and what's included. They can also hide it from customers or reorder it.
A few rules protect existing bookings:

- An activity's URL (its slug) is fixed when it's created, so links and bookings keep working after
  a rename.
- A court can't be removed while it has upcoming bookings.
- An activity with any bookings can't be deleted. Hide it instead.

`defaultActivities` in `lib/facility.ts` is only the starting set, used until staff save their
first change.

The home page has a **Recent events** section showing tournaments, clinics and private events the
facility has hosted. Staff manage these at `/admin/events`, with a photo, date, activity, short
write-up and number of players. The section hides itself when there are no published events.
Photos are shrunk in the browser (at most 1600px, about 900 KB) before upload. They are stored in
`data/uploads/` and served at `/uploads/<file>`.

## How data is stored

The app reads and writes data only through [`lib/store.ts`](lib/store.ts), which picks a backend:

| | Local development | Production (Vercel) |
|---|---|---|
| Bookings, activities, events, settings | JSON files in `data/` ([`lib/store-file.ts`](lib/store-file.ts)) | Postgres when `DATABASE_URL` is set ([`lib/store-postgres.ts`](lib/store-postgres.ts)) |
| Photos and payment QR | `data/uploads/` | Vercel Blob when `BLOB_READ_WRITE_TOKEN` is set ([`lib/uploads.ts`](lib/uploads.ts)) |
| Emails without SMTP | Saved to `data/outbox/` for preview | Not sent; staff see the error |
| Login lockout counter | In memory | Postgres, shared by all instances |

In Postgres, a database rule (`bookings_no_overlap`, an exclusion constraint) rejects any active
booking that overlaps another on the same court. Double-booking stays impossible even with
simultaneous requests across many serverless instances. On Vercel, the app refuses to start without
a database or Blob store rather than silently losing data.

Activity and event data is cached (`"use cache"` with the `activities` and `events` tags) and
refreshed whenever staff save a change. If you edit the data by hand, redeploy (or restart the dev
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
   `STAFF_PASSWORD`, `SESSION_SECRET`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`,
   `MAIL_FROM`, and `SITE_URL` once you have a custom domain. Without `SITE_URL`, email links use
   Vercel's production domain.
5. **Deploy.** The build reads activities and events from the database, so connect the database
   before the first deploy.
6. **Optional: bring over local data.** With `DATABASE_URL` and `BLOB_READ_WRITE_TOKEN` in
   `.env.local`, run `npm run db:import`. It copies `data/*.json` and `data/uploads/*` into the
   production stores without overwriting anything already there.
7. Sign in at `/admin`, upload the payment QR in **Settings**, and send a test email.

## Before going live

- **Set `STAFF_PASSWORD` and `SESSION_SECRET`** on the host (see `.env.example`), and serve the
  site over HTTPS so the session cookie is only sent encrypted.
- **Replace the sample events.** The three events marked "Sample — replace me" in `/admin/events`
  are placeholders. Swap in the client's real events, or delete them.
- **Connect Postgres and Blob** in production (see [Deploy to Vercel](#deploy-to-vercel)). The JSON
  files are for local development only.
- **Set up payments and email.** Upload the payment QR in Settings, set the `SMTP_*` variables and
  `SITE_URL`, and send a test email.
- **Payments are checked by hand.** Staff match the customer's reference against the GCash/Maya
  account. For automatic confirmation, integrate a payment gateway such as PayMongo.
- **Unpaid holds aren't released automatically.** Overdue bookings are flagged and staff cancel them.
