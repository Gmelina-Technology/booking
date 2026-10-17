# Courtside Hub — facility booking site

A booking website for a sports facility with several activities (pickleball, badminton, tennis,
basketball, table tennis). Customers pick an activity, a date, a court and a time slot, enter their
details, and get a booking reference. Staff see every booking per day and can cancel them.

Built with Next.js 16 (App Router, Cache Components), React 19 and Tailwind CSS 4.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Pages

| Route | What it does |
|-------|--------------|
| `/` | Landing page, the activity list and the recent events showcase |
| `/activities/[slug]` | Booking flow: date → court → time (1–N consecutive hours) → details |
| `/bookings/[id]` | Confirmation page with the booking reference |
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

- **Protect `/admin`.** It has no login yet, and anyone can change prices and activities there.
- **Replace the sample events.** The three events marked "Sample — replace me" in `/admin/events`
  are placeholders. Swap in the client's real events, or delete them.
- **Use a real database.** A JSON file works for one server only. It does not work on serverless
  hosting such as Vercel. Uploaded photos also need persistent storage (a mounted disk, or
  S3/Cloudinary).
- **Payments.** Customers currently pay at the front desk. Add online payment (e.g. PayMongo or
  Stripe) if the client wants to take deposits.
- **Notifications.** Add email or SMS confirmations if needed.
