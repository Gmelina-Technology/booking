# Courtside Hub — facility booking site

A booking website for a sports facility with several activities (pickleball, badminton, tennis,
basketball, table tennis). Customers pick an activity, a date, a court and a time slot, enter their
details, and get a booking reference. Staff see every booking per day and can cancel them.

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

## Pages

| Route | What it does |
|-------|--------------|
| `/` | Landing page, the activity list and the recent events showcase |
| `/activities/[slug]` | Booking flow: date → court → time (1–N consecutive hours) → details |
| `/bookings/[id]` | Confirmation page with the booking reference |
| `/login` | Staff sign-in |
| `/admin` | Staff view: bookings per day, filter by activity, cancel bookings |
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

Bookings, activities and events are saved to `data/*.json` (photos in `data/uploads/`) by
[`lib/store.ts`](lib/store.ts), so the site runs with no setup. Writes are serialized and bookings
are re-checked for overlaps, so the same court can't be double-booked. The app reaches storage only
through that module, so you can swap in a real database without touching the pages.

Activity and event data is cached (`"use cache"` with the `activities` and `events` tags) and
refreshed whenever staff save a change. If you edit the JSON files by hand, restart the server to
see the change.

## Before going live

- **Set `STAFF_PASSWORD` and `SESSION_SECRET`** on the host (see `.env.example`), and serve the
  site over HTTPS so the session cookie is only sent encrypted.
- **Replace the sample events.** The three events marked "Sample — replace me" in `/admin/events`
  are placeholders. Swap in the client's real events, or delete them.
- **Use a real database.** A JSON file works for one server only. It does not work on serverless
  hosting such as Vercel. Uploaded photos also need persistent storage (a mounted disk, or
  S3/Cloudinary).
- **Payments.** Customers currently pay at the front desk. Add online payment (e.g. PayMongo or
  Stripe) if the client wants to take deposits.
- **Notifications.** Add email or SMS confirmations if needed.
