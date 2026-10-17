// Types shared by the storage backends (lib/store-file.ts, lib/store-postgres.ts)
// and the public store API (lib/store.ts).

/**
 * Booking lifecycle:
 *   pending          customer requested it; the slot is held while staff review
 *   awaiting_payment staff approved and emailed the downpayment QR
 *   confirmed        staff verified the downpayment
 *   cancelled        declined or cancelled; the slot is free again
 */
export type BookingStatus = "pending" | "awaiting_payment" | "confirmed" | "cancelled";

export type EmailKind = "payment_request" | "confirmed" | "cancelled";
export type EmailLogEntry = { kind: EmailKind; at: string; ok: boolean; detail: string };

export type Booking = {
  /** Short reference customers quote at the front desk. Not a secret. */
  id: string;
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
  /** Amount due up front, fixed when staff approve the booking. */
  downpayment?: number;
  approvedAt?: string;
  /** Reference number the customer entered after paying (e.g. GCash ref). */
  paymentRef?: string;
  paymentSubmittedAt?: string;
  paidAt?: string;
  cancelledAt?: string;
  cancelReason?: string;
  emails?: EmailLogEntry[];
};

export type BookingFilter = { activitySlug?: string; date?: string };

/** Keys of the small JSON documents stored alongside bookings. */
export type DocKey = "activities" | "events" | "settings";

export type LoginFailure = { count: number; untilMs: number };

/** What each storage backend implements. lib/store.ts builds the app-facing API on top. */
export interface StoreBackend {
  listBookings(filter: BookingFilter): Promise<Booking[]>;
  findBooking(by: "id" | "accessToken", value: string): Promise<Booking | undefined>;
  /** Inserts the booking, or returns false if it overlaps an active booking on the same court. */
  insertBooking(booking: Booking): Promise<boolean>;
  /** Atomically applies `change`; if `change` throws, nothing is written and the error propagates. */
  updateBooking(id: string, change: (b: Booking) => void): Promise<Booking | null>;

  readDoc<T>(key: DocKey, fallback: T): Promise<T>;
  /** Atomic read-modify-write of a document. */
  updateDoc<T, R>(key: DocKey, fallback: T, change: (doc: T) => { doc: T; result: R }): Promise<R>;

  getLoginFailure(ip: string): Promise<LoginFailure | null>;
  /** Counts a failed login and returns the new state. The count resets once the lock expires. */
  recordLoginFailure(ip: string, lockMs: number): Promise<LoginFailure>;
  clearLoginFailures(ip: string): Promise<void>;
}
