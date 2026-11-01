import { expect, test } from "vitest";
import { confirmedEmail } from "@/lib/emails";
import { defaultProfile } from "@/lib/facility";
import type { Booking } from "@/lib/store";

const booking = (b: Partial<Booking>): Booking => ({
  id: "B1",
  ownerId: "o1",
  activitySlug: "pickleball",
  resourceId: "pb-1",
  date: "2026-11-10",
  startHour: 8,
  hours: 2,
  name: "Juan",
  email: "juan@example.test",
  phone: "09171234567",
  players: 4,
  notes: "",
  total: 800,
  status: "confirmed",
  createdAt: "2026-11-01T00:00:00Z",
  ...b,
});
const ctx = (b: Partial<Booking>) => ({ booking: booking(b), link: "https://example.test/bookings/t", business: defaultProfile("Club", "club@example.test") });

test("confirmation after a downpayment shows what was paid and the balance", () => {
  const mail = confirmedEmail(ctx({ downpayment: 400 }));
  expect(mail.text).toContain("We've received your downpayment");
  expect(mail.text).toContain("Downpayment received");
  expect(mail.text).toContain("Balance at the front desk");
});

test("confirmation with no downpayment asks for the full total at the venue", () => {
  const mail = confirmedEmail(ctx({ downpayment: 0 }));
  expect(mail.text).not.toContain("downpayment");
  expect(mail.text).toMatch(/Pay at the front desk: .*800/);
});
