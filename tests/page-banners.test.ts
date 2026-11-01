import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Page banners: who sees which, dismissing generic ones, and custom actions.
// Uses the JSON file store (no DATABASE_URL) in a temp folder, like store.test.ts.
vi.mock("next/cache", () => ({ cacheLife: () => {}, cacheTag: () => {} }));

const cwd = process.cwd();
let dir: string;
let store: typeof import("@/lib/store");
let banners: typeof import("@/lib/page-banners");

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "booking-test-"));
  process.chdir(dir);
  store = await import("@/lib/store");
  banners = await import("@/lib/page-banners");
});

afterAll(async () => {
  process.chdir(cwd);
  await rm(dir, { recursive: true, force: true });
});

async function newOwner(handle: string, feeTermsAcceptedAt?: string) {
  const { owner } = await store.insertOwner({
    handle,
    email: `${handle}@example.test`,
    passwordHash: "x",
    profile: { name: `${handle} courts`, tagline: "", address: "", phone: "", email: "" },
    ...(feeTermsAcceptedAt && { feeTermsAcceptedAt }),
  });
  return owner!;
}

/** Runs after() tasks right away, so tests can wait for them with `settle()`. */
const tasks: Promise<void>[] = [];
const ctx = (adminEmails: string[] = []) => ({ baseUrl: "https://example.test", adminEmails, after: (t: () => Promise<void>) => void tasks.push(t()) });
const settle = () => Promise.all(tasks.splice(0));

const generic = { kind: "generic", tone: "info", title: "Maintenance", body: "Sunday 2am.", createdBy: "admin@example.test" } as const;

describe("page banners", () => {
  it("asks partners from before fees to agree, and stops once they do", async () => {
    const old = await newOwner("oldcourts");
    const fresh = await newOwner("newcourts", new Date().toISOString());

    expect((await banners.bannersFor(old)).map((b) => b.id)).toEqual(["fee-terms"]);
    expect(await banners.bannersFor(fresh)).toEqual([]);

    const r = await banners.runBannerAction("fee-terms", old, ctx());
    expect(r.ok).toBe(true);
    const after = (await store.getOwnerById(old.id))!;
    expect(after.feeTermsAcceptedAt).toBeTruthy();
    expect(await banners.bannersFor(after)).toEqual([]);
    expect((await banners.runBannerAction("fee-terms", after, ctx())).ok).toBe(false);
  });

  it("shows the partner's rate as the platform changes it", async () => {
    const o = await newOwner("ratewatch");
    const detail = banners.BANNER_ACTIONS["accept-fee-terms"].detail!;
    expect(await detail(o)).toBe("Your rate: ₱15 per booking.");

    const { addDays, facilityNow, formatDate } = await import("@/lib/time");
    const tomorrow = addDays(facilityNow().date, 1);
    await store.updateFeeSchedule((doc) => {
      doc.rates.push({ id: "r25", scope: "platform", perBooking: 25, effectiveFrom: tomorrow, createdAt: new Date().toISOString(), createdBy: "a@example.test" });
    });
    expect(await detail(o)).toBe(`Your rate: ₱15 per booking, then ₱25 per booking from ${formatDate(tomorrow, { weekday: undefined, year: "numeric" })}.`);
    await store.updateFeeSchedule((doc) => {
      doc.rates = [];
    });
  });

  it("tells platform admins in the bell and by email when a partner responds, then hides for that partner", async () => {
    const a = await newOwner("helpme", new Date().toISOString());
    const b = await newOwner("fine", new Date().toISOString());
    const banner = await banners.addBanner({ kind: "custom", tone: "info", title: "Want help?", body: "We'll reach out.", action: "notify-platform", createdBy: "admin@example.test" });

    expect((await banners.bannersFor(a)).map((x) => x.id)).toEqual([banner.id]);
    expect((await banners.runBannerAction(banner.id, a, ctx(["boss@example.test", a.email]))).ok).toBe(true);
    await settle();
    expect(await banners.bannersFor(a)).toEqual([]);
    expect((await banners.bannersFor(b)).map((x) => x.id)).toEqual([banner.id]);

    const [n] = await store.readPlatformNotifications();
    expect(n).toMatchObject({ kind: "banner_response", ownerId: a.id, title: "helpme courts responded: Want help?" });
    // Emailed to every admin but the partner themselves (an admin's own business).
    const sent = (await readdir(path.join(dir, "data", "outbox"))).filter((f) => f.includes("boss") || f.includes("helpme"));
    expect(sent).toHaveLength(1);
    const mail = await readFile(path.join(dir, "data", "outbox", sent[0]), "utf8");
    expect(mail).toContain("Want help?");
    expect(mail).toContain(`https://example.test/admin/partners/${a.id}`);

    expect((await banners.runBannerAction(banner.id, a, ctx())).ok).toBe(false);
    await banners.endBanner(banner.id);
  });

  it("can't dismiss a custom banner", async () => {
    const o = await newOwner("stubborn");
    expect((await banners.dismissBanner("fee-terms", o)).ok).toBe(false);
    expect((await banners.bannersFor(o)).map((b) => b.id)).toContain("fee-terms");
  });

  it("hides a generic banner only for the partner who dismissed it", async () => {
    const a = await newOwner("alpha", new Date().toISOString());
    const b = await newOwner("bravo", new Date().toISOString());
    const banner = await banners.addBanner({ ...generic });

    expect((await banners.bannersFor(a)).map((x) => x.id)).toEqual([banner.id]);
    expect((await banners.dismissBanner(banner.id, a)).ok).toBe(true);
    expect(await banners.bannersFor(a)).toEqual([]);
    expect((await banners.bannersFor(b)).map((x) => x.id)).toEqual([banner.id]);

    expect((await banners.endBanner(banner.id)).ok).toBe(true);
    expect(await banners.bannersFor(b)).toEqual([]);
    expect((await banners.listPageBanners()).find((x) => x.id === banner.id)?.endedAt).toBeTruthy();
  });

  it("filters by sign-up date and last day, and puts actions first", () => {
    const owner = { id: "o1", createdAt: "2026-06-01T04:00:00.000Z", feeTermsAcceptedAt: undefined } as unknown as import("@/lib/store").Owner;
    const base = { ...generic, createdAt: "2026-10-01T00:00:00.000Z", dismissedBy: [] };
    const all: import("@/lib/page-banners").PageBanner[] = [
      { ...base, id: "late-joiners", joinedBefore: "2026-06-01" },
      { ...base, id: "early-joiners", joinedBefore: "2026-06-02" },
      { ...base, id: "expired", until: "2026-10-31" },
      { ...base, id: "ends-today", until: "2026-11-02" },
      ...banners.builtInBanners(),
    ];
    expect(banners.visibleBanners(all, owner, "2026-11-02").map((b) => b.id)).toEqual(["fee-terms", "early-joiners", "ends-today"]);
  });
});
