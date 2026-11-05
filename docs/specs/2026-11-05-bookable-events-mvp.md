# Bookable events — MVP spec

**Status:** MVP built · **Date:** 2026-11-05 · **Branch:** `claude/bookable-events-scheduling-d08fe5`

Partners can host **open play, workshops and tournaments** that players register and pay for on the
partner's page. Today "events" are only a showcase of past events (`PastEvent`, `/app/events`); this
adds events that are scheduled, have a limited number of spots, hold courts, and take registrations.

## Decisions (agreed)

| Topic | Decision |
|---|---|
| Kinds | `open_play`, `workshop`, `tournament`. **Coaching is out of the MVP.** A coach-led workshop is a workshop with the coach in the description. |
| Approval | No approval step. Registering holds a spot and shows the payment QR at once; it is **confirmed when staff verify the payment** (same verify action as court bookings). |
| Time grid | Events start and end on **:00 or :30**. Courts are held for every whole hour the event touches (7:30–9:00 holds 7:00–9:00). |
| Booking fee | The flat platform fee, **once per registration**, paid by the player on top (a team registration is one fee). |
| Tournaments | The **captain registers the team** (team name + player names) and pays the team price. Capacity counts teams. |
| One day | An event is on one date. Multi-day tournaments are out of scope. |
| Repeats | Out of scope. Each event is one-off (partner can duplicate one). |

## Concepts

- **Hosted event** — something the partner schedules: kind, activity, date, start/end, courts, spots, price.
- **Registration** — one player (or one team) taking spots in a hosted event. Follows the booking lifecycle
  `awaiting_payment → confirmed`, or `cancelled`.
- **Court hold** — while an event is published, its courts are held by **blocked bookings** tagged with the
  event's id. The existing overlap rule (`bookings_owner_no_overlap`) then keeps court bookings off them,
  and the calendar and court booking widget show those hours as taken with no extra work.

## Data model

### `HostedEvent` (new, `lib/facility.ts`)

Stored as the owner document kind **`"hosted-events"`** (add to `DocKind`), cached like activities and
past events with tag `hosted-events:<ownerId>`. Named `HostedEvent` to stay clear of the DOM `Event`
type, the auth `session`, and the existing `PastEvent`.

```ts
export type HostedEventKind = "open_play" | "workshop" | "tournament";

export type HostedEvent = {
  id: string;
  kind: HostedEventKind;
  title: string;
  activitySlug: string;
  description: string;
  /** Uploads store file name, or null for the activity's card colour. */
  photo: string | null;
  /** "YYYY-MM-DD" */
  date: string;
  /** Minutes after midnight, multiples of 30. end > start. Within the activity's opening hours. */
  startMinute: number;
  endMinute: number;
  /** Resource ids of the activity held for the event. At least one. */
  resourceIds: string[];
  /** Players for open play/workshop, teams for tournaments. */
  capacity: number;
  /** Most spots one registration can take (open play/workshop). Tournaments: always 1 team. Default 4. */
  maxSpotsPerRegistration: number;
  /** Tournaments only: players per team (e.g. 2 for doubles). Captain must name this many. */
  teamSize?: number;
  /** Per player (open play/workshop) or per team (tournament). 0 = free. */
  price: number;
  /** "online": pay the full price by QR, confirmed when staff verify. "venue": confirmed on registering, paid at the door. */
  payment: "online" | "venue";
  /** Registration closes this many hours before the start. Default 2. */
  closeHoursBefore: number;
  /** draft: only staff see it, holds nothing. published: listed, courts held, open for registration. */
  status: "draft" | "published" | "cancelled";
  cancelledAt?: string;
  cancelReason?: string;
  createdAt: string;
  updatedAt: string;
};
```

Derived, never stored: **spots taken** = sum of `spots` over the event's registrations that aren't
cancelled; **spots left** = `capacity − taken`; **open for registration** = published, not paused/suspended,
spots left > 0, now is before `start − closeHoursBefore`.

### Registrations live in the bookings table

A registration is a `Booking` row with `eventId` set. This reuses, unchanged or nearly: the private
`/bookings/[token]` page, payment reference + receipt upload, hold release (`lib/holds.ts`), booking emails
and the email log, staff notifications, sales, fee statements and the platform admin's all-bookings view.

New optional fields on `Booking` (all in `data` jsonb, no column change):

```ts
/** Set on registrations for a hosted event, and on the blocked bookings that hold its courts. */
eventId?: string;
/** Registrations: spots taken (players, or 1 for a tournament team). */
spots?: number;
/** Tournament registrations. */
teamName?: string;
teamPlayers?: string[];
```

How each kind of row is shaped:

| Row | `resourceId` | `date / startHour / hours` | `blocked` | `total` |
|---|---|---|---|---|
| Court hold (one per held court) | the court | the whole hours the event touches | `true` | 0 |
| Registration | `reg-<booking id>` (unique, so it never collides on the overlap rule) | the same whole hours | — | `price × spots` + fee (tournament: `price` + fee) |

Exact half-hour times are always read from the `HostedEvent`, never the row.

**Registrations must never block a court** (`eventId` set and not `blocked`). Their unique `reg-…`
resource means the calendar grid, the court booking widget and staff availability never match them to a
court. This is the main risk of reusing the table, so it has tests.

> **As built:** registrations *do* appear in staff booking lists, the inbox and booking counts, labelled
> with the event's title and exact time (`bookingPlace` / `bookingTime` in `lib/event-schedule.ts`). That
> way payments to verify show up in the inbox. The event's title, times and closing time are copied onto
> each registration, so no list has to read the event. The booking editor refuses event rows: holds and
> registrations are changed from the event. A free event still charges the flat booking fee per
> registration (paid at the venue when payment is "venue").

### Capacity is checked atomically

Two people must not both get the last spot.

- **Postgres:** `insertRegistration()` runs in a transaction that takes
  `pg_advisory_xact_lock(hashtext('event:' || event_id))`, sums active spots for the event, and inserts
  only if they fit.
- **JSON store:** writes already go through one in-memory queue (`lib/store-file.ts`), so the same
  count-then-insert inside the queued write is enough.

New store function: `insertRegistration(booking, capacity): Promise<"ok" | "full">`.

## Rules

### Creating and publishing (staff)

1. **Draft** saves with no checks beyond field validation and holds nothing.
2. **Publish** checks that:
   - the date is within the booking window and not a closure for the business or activity, and not a
     weekly closed day;
   - the time is within the activity's open hours, on the 30-minute grid;
   - each chosen court is free for the held hours.

   Then it inserts one blocked booking per court. If any court is taken, nothing is inserted and staff see
   which courts clash with which bookings.
3. Online payment needs payment set up (`paymentReady`), as with court bookings; otherwise only "venue" is
   allowed.

### Editing a published event

- **Title, description, photo, closing hours:** editable any time.
- **Capacity:** can go up any time, and down only to the spots already taken.
- **Date, time, courts, price, kind, team size:** editable only while there are **no active
  registrations**. Changing date, time or courts re-holds the courts in one go: the new blocks are inserted
  first, and the old ones are released only if that succeeds. With registrations, staff must cancel the
  event and create a new one.
- **Duplicate** creates a new draft with the same details and no date.

### Cancelling an event (staff)

Asks for a reason. It then:

- cancels every active registration with that reason;
- emails each registrant "event cancelled" (the partner arranges refunds outside the app, as today);
- releases the court holds;
- sets the status to `cancelled`.

The event stays visible to staff, and is hidden from the public page.

### Registering (player)

The form asks for name, email, phone and spots (open play or workshop). For a tournament it asks for the team
name and `teamSize` player names instead. It also has an optional note and the same honeypot and rate
limits as `createBooking()`.

The registration is refused when:

- the event isn't open for registration;
- the page is paused or suspended;
- spots are more than `maxSpotsPerRegistration` or more than the spots left;
- the event is full at insert time ("Sorry, the last spots just went").

On success:

- **Online payment:** the status is `awaiting_payment`, with `approvedAt` = now and `downpayment` = the
  full `total`. The player sees the payment QR on the confirmation page, and gets the payment request email.
- **Pay at venue, or a free event:** the status is `confirmed` straight away, and the player gets the
  confirmed email.

### Holds on unpaid registrations

The hold is released, using the existing reasons and emails, when either of these comes first:

- the partner's `paymentWindowHours` passes with no payment reference;
- registration closes for the event with no payment reference.

Registrations with a reference wait for staff to verify, as today.

### Cancelling registrations

- **Player:** can cancel from the booking page until registration closes.
- **Staff:** can cancel at any time.

Either way, the spots go back to the pool.

### Fees and sales

- **Fee:** one flat fee per registration (`feeFor(rate, …)` on a flat rate). Court holds are blocked
  bookings, so they are never charged.
- **Monthly statement:** a confirmed registration is charged once the event's end has passed. The current
  `isCharged` check (start hour + hours) already does this, because the row's hours cover the event.
- **Sales:** registrations count as revenue under their activity, and get an "Events" breakdown on
  `/app/sales`.

### Interaction with existing features

- **Closures:** a closure added on a day with a published event warns staff, but doesn't cancel the event
  by itself.
- **Pausing the page:** blocks new registrations. Existing ones are unchanged.
- **Deleting the account:** refused while an upcoming event has active registrations, matching the rule for
  bookings.

## Screens

### Public

- **`/p/@handle`:** a new **Upcoming events** section above Recent events. It shows the next published
  events, sorted by date, as cards with kind, title, date, time, activity, price and "N spots left" (or
  "Full"). The section is hidden when there are none.
- **`/p/@handle/events/[id]`** (new): the event page. It shows the photo, title, kind badge, date and time,
  courts, description, price, a bar of spots left, and when registration closes. Below that is the
  register form, or a closed, full or cancelled notice. It has an OG image, like the business page.
- **`/bookings/[token]`:** for registrations, show the event title, date and half-hour time, the spots or
  team, and the players, in place of the court and slot. The payment and cancel flows stay the same.

### Partner (`/app/events`)

- **Tabs:** **Upcoming** (hosted events: drafts, published, recently cancelled) and **Past** (the current
  showcase, unchanged).
- **`/app/events/hosted/new`** and **`/app/events/hosted/[id]/edit`:** the event form, in sections.
  1. What: kind, title, activity, description, photo.
  2. When: date, start and end times in 30-minute steps.
  3. Courts: checkboxes of the activity's courts, with clashes shown for the chosen time.
  4. Spots and price: capacity, max per registration (or team size), price, online or venue payment.
  5. Registration: hours before the start when it closes.

  The form has **Save draft** and **Publish** buttons.
- **`/app/events/hosted/[id]`:** the roster. It shows a spots-taken summary, and a registrations table with
  name, spots or team, status, payment reference and receipt, and total. Each row has the existing
  booking actions: verify payment, record paid in full, cancel. The page also has **Cancel event**,
  **Duplicate** and **Edit** buttons.
- **Overview, calendar and notifications:**
  - The calendar shows the held courts as one labelled event block.
  - A new notification kind `event_registration` fires when someone registers.
  - The existing `payment_submitted` notification applies to registrations too.

## Emails

The existing templates are reused, with event wording when `eventId` is set: payment request,
confirmed, cancelled, and payment retry. One new template is added:

- **Event cancelled by the business**, sent to each active registrant, with the reason and the partner's
  contact details.

## Acceptance criteria

1. Staff can create a draft open play, workshop or tournament, and nothing is held until they publish.
2. Publishing holds every chosen court for the whole hours the event touches. A court booking for those
   hours is refused, and the booking widget shows them as taken.
3. Publishing fails, and writes nothing, when any chosen court is already booked. The clashing bookings are
   named.
4. A published event shows on the business page and on its own page, with the correct spots left.
5. A player can register for 1 to `maxSpotsPerRegistration` spots. With online payment they are sent to the
   payment QR in `awaiting_payment`; with venue payment or a free event they are `confirmed` at once.
6. A tournament registration requires a team name and exactly `teamSize` player names, and takes one spot.
7. Two registrations racing for the last spot: exactly one succeeds. This is tested on both store backends.
8. An unpaid registration is released when the payment window passes, or when registration closes,
   whichever comes first. Its spots return to the pool.
9. Staff verifying the payment confirms the registration. The flat booking fee appears on the partner's
   statement once the event has ended.
10. Cancelling the event cancels every active registration and emails each registrant. It also frees the
    courts, so they can be booked again.
11. Registrations never block a court: not in the calendar grid, court availability, or the court overlap rule.
12. Date, time, courts and price can't be changed while the event has active registrations. Capacity can't
    go below the spots taken.
13. Registration is refused while the page is paused or suspended, and after registration closes.

## Tests (Vitest, `tests/`)

- `events.test.ts`:
  - publish holds courts;
  - a clash on publish rolls back;
  - re-holding courts on an edit;
  - cancelling cascades to registrations and holds;
  - the half-hour to whole-hour mapping.
- `store.test.ts`:
  - `insertRegistration` capacity race on the JSON store (and on Postgres when `DATABASE_URL` is set in
    CI);
  - registrations don't block courts.
- `holds` cases: release at registration close.
- `fees.test.ts`: one fee per registration, and none on court holds.

## Out of scope (later phases)

| Feature | Phase |
|---|---|
| Repeating events (every Tue and Thu) | 2 |
| Waitlist | 2 |
| Roster check-in with QR at the door | 2 |
| Messaging every registrant | 2 |
| A draft past event made automatically when an event ends | 2 |
| "Open play near me" filter on the directory map | 2 |
| Coaching (coaches, coaching slots, coach availability) | 3 |
| Multi-day tournaments, brackets, results | 3+ |
| Refunds in the app | — |

## Build order (by layer)

1. **backend-dev:**
   - the types, `hosted-events` document, and store functions (`insertRegistration` with the capacity
     lock);
   - publish, edit and cancel actions with the court holds;
   - the register action;
   - hold expiry at registration close;
   - excluding registrations from court views;
   - the fee, sales and notification hooks;
   - the tests.
2. **ui-ux-designer:** the event card, the event page with the register form, the staff event form and the
   roster.
3. **frontend-dev:** the public section and event page, the `/app/events` tabs, the form, the roster, the
   calendar block, and event wording on the booking page and in emails.
4. **README:** routes table, Events section, data storage note.
