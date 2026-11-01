// Types shared by the storage backends (lib/store-file.ts, lib/store-postgres.ts)
// and the public store API (lib/store.ts).

import type { BusinessProfile } from "./facility";

/**
 * Booking lifecycle:
 *   pending          customer requested it; the slot is held while staff review
 *   awaiting_payment staff approved and emailed the downpayment QR
 *   confirmed        staff verified the downpayment
 *   cancelled        declined or cancelled; the slot is free again
 */
export type BookingStatus = "pending" | "awaiting_payment" | "confirmed" | "cancelled";

export type EmailKind = "payment_request" | "confirmed" | "cancelled" | "rescheduled" | "payment_retry";
export type EmailLogEntry = { kind: EmailKind; at: string; ok: boolean; detail: string };

export type Booking = {
  /** Short reference customers quote at the front desk. Not a secret. */
  id: string;
  /** The business the booking belongs to. */
  ownerId: string;
  /**
   * Unguessable token in the confirmation link (/bookings/<token>). Missing on
   * bookings made before links were added; those are only visible to staff.
   */
  accessToken?: string;
  activitySlug: string;
  resourceId: string;
  date: string;
  startHour: number;
  hours: number;
  name: string;
  email: string;
  phone: string;
  players: number;
  notes: string;
  total: number;
  status: BookingStatus;
  createdAt: string;
  /** Entered by staff (walk-in or phone), so never released automatically: staff follow up themselves. */
  staffCreated?: boolean;
  /** A court staff blocked (maintenance, private use). Always confirmed, with no customer, revenue or fee. */
  blocked?: boolean;
  /** Amount due up front, fixed when staff approve the booking. */
  downpayment?: number;
  approvedAt?: string;
  /** Reference number the customer entered after paying (e.g. GCash ref). */
  paymentRef?: string;
  paymentSubmittedAt?: string;
  /** Amount the customer says they paid, entered with the reference. */
  paymentAmount?: number;
  /** Receipt screenshot the customer uploaded with the reference (a name in the uploads store). */
  paymentReceipt?: string;
  /** When staff verified the downpayment. */
  paidAt?: string;
  /** When staff recorded the whole total as paid (paid in full, or the balance collected at the venue). */
  balancePaidAt?: string;
  /** When staff marked a confirmed booking as a no-show. It stays confirmed, since the court was held. */
  noShowAt?: string;
  /** When staff last moved the booking to another time or court. */
  rescheduledAt?: string;
  cancelledAt?: string;
  cancelReason?: string;
  /** The customer cancelled it themselves from their booking page. */
  cancelledByCustomer?: boolean;
  emails?: EmailLogEntry[];
  /** When staff erased the customer's personal details (name, email, phone, notes, payment reference). */
  erasedAt?: string;
};

/** A business owner's account. Each one has a public page at /p/@<handle>. */
export type Owner = {
  id: string;
  /** Lowercase, unique, permanent: it's in the page URL. */
  handle: string;
  /** Sign-in email, lowercase and unique. */
  email: string;
  passwordHash: string;
  /** Goes up to revoke every session issued before (lib/session.ts). Missing means 0. */
  sessionVersion?: number;
  createdAt: string;
  profile: BusinessProfile;
  /** When the partner agreed to the per-booking fee (lib/fees.ts). Missing on accounts from before fees. */
  feeTermsAcceptedAt?: string;
  /**
   * Set while a platform admin has suspended the partner: their page is off
   * the directory, returns 404 and takes no new requests. They can still sign
   * in and look after the bookings they already have.
   */
  suspension?: { at: string; by: string; reason: string };
  /**
   * Set while the partner has paused their own page (a holiday, renovation):
   * it stays online with their message but takes no new requests, and leaves
   * the directory. `until` ("YYYY-MM-DD") is the day it reopens by itself.
   */
  pause?: PagePause;
};

export type PagePause = { at: string; message: string; until?: string };

/** What a staff notification is about (lib/notifications.ts). */
export type NotificationKind = "new_request" | "payment_submitted" | "hold_released" | "customer_cancelled";

/** One entry in the staff notification bell. */
export type AppNotification = {
  id: string;
  kind: NotificationKind;
  bookingId: string;
  title: string;
  body: string;
  at: string;
  /** When staff read it. Missing means unread. */
  readAt?: string;
};

export type BookingFilter = { ownerId: string; activitySlug?: string; date?: string; status?: BookingStatus };

/** Platform admins only (/admin/all-bookings): bookings across every partner, by date range ("YYYY-MM-DD", inclusive). */
export type PlatformBookingFilter = { ownerId?: string; from?: string; to?: string; status?: BookingStatus };

/** The small JSON documents each owner has alongside their bookings. */
export type DocKind = "activities" | "events" | "settings" | "hero" | "notifications";

/** Documents shared by the whole platform rather than one owner. */
export type PlatformDocKind = "fees" | "view-as-log" | "partner-log" | "notifications";

/** A platform admin starting or stopping "view as" for a partner, kept for accountability. */
export type ViewAsLogEntry = { at: string; event: "start" | "stop"; adminEmail: string; ownerId: string; ownerHandle: string };

/** A platform admin suspending or reinstating a partner, kept for accountability. */
export type PartnerLogEntry = { at: string; event: "suspend" | "reinstate"; adminEmail: string; ownerId: string; ownerHandle: string; reason?: string };

/** What a platform notification is about (lib/platform-notifications.ts). */
export type PlatformNotificationKind = "partner_joined";

/** One entry in a platform admin's notification bell. Shared by every admin, each with their own read state. */
export type PlatformNotification = {
  id: string;
  kind: PlatformNotificationKind;
  ownerId: string;
  title: string;
  body: string;
  at: string;
  /** Ids of the admins who have read it. */
  readBy: string[];
};

/** Thrown by updateBooking() when the changed booking would overlap an active booking on the same court. */
export class SlotTaken extends Error {
  constructor() {
    super("That court is already booked for part of that time.");
  }
}

export type LoginFailure = { count: number; untilMs: number };

export type InsertOwnerResult = "ok" | "handle_taken" | "email_taken";

/** What each storage backend implements. lib/store.ts builds the app-facing API on top. */
export interface StoreBackend {
  listOwners(): Promise<Owner[]>;
  findOwner(by: "id" | "handle" | "email", value: string): Promise<Owner | undefined>;
  /**
   * Creates the account unless the handle or email is taken. The very first
   * account also adopts any data from before accounts existed (bookings and
   * documents with no owner), so an existing single-business install carries over.
   */
  insertOwner(owner: Owner): Promise<InsertOwnerResult>;
  /** Atomically applies `change`; if `change` throws, nothing is written. */
  updateOwner(id: string, change: (o: Owner) => void): Promise<Owner | null>;
  /** Deletes the account with all its bookings and documents. Uploaded files are deleted by the caller. */
  deleteOwner(id: string): Promise<void>;

  listBookings(filter: BookingFilter): Promise<Booking[]>;
  /** Every partner's bookings in the filter, by date and start hour. Platform admins only. */
  listPlatformBookings(filter: PlatformBookingFilter): Promise<Booking[]>;
  findBooking(by: "id" | "accessToken", value: string): Promise<Booking | undefined>;
  /** Inserts the booking, or returns false if it overlaps an active booking on the same court. */
  insertBooking(booking: Booking): Promise<boolean>;
  /**
   * Atomically applies `change`; if `change` throws, nothing is written and the error propagates.
   * Throws SlotTaken if the changed booking would overlap another active booking on its court.
   */
  updateBooking(id: string, change: (b: Booking) => void): Promise<Booking | null>;

  readDoc<T>(ownerId: string, kind: DocKind, fallback: T): Promise<T>;
  /** Atomic read-modify-write of a document. */
  updateDoc<T, R>(ownerId: string, kind: DocKind, fallback: T, change: (doc: T) => { doc: T; result: R }): Promise<R>;

  readPlatformDoc<T>(kind: PlatformDocKind, fallback: T): Promise<T>;
  /** Atomic read-modify-write of a platform document. */
  updatePlatformDoc<T, R>(kind: PlatformDocKind, fallback: T, change: (doc: T) => { doc: T; result: R }): Promise<R>;

  getLoginFailure(ip: string): Promise<LoginFailure | null>;
  /** Counts a failed login and returns the new state. The count resets once the lock expires. */
  recordLoginFailure(ip: string, lockMs: number): Promise<LoginFailure>;
  clearLoginFailures(ip: string): Promise<void>;
}
