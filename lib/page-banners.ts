import { randomBytes } from "node:crypto";
import { describePartnerRate } from "./fee-text";
import { MAX_KEPT } from "./platform-notifications";
import { readFeeSchedule, readPageBanners, updateOwner, updatePageBanners, updatePlatformNotifications, type Owner } from "./store";
import type { PageBanner, PageBannerAction } from "./store-types";
import { facilityNow } from "./time";

// Notices at the top of every partner dashboard page (/app), for things
// partners shouldn't miss by not opening the right page. Platform admins post
// and end them at /admin/banners. Two kinds:
//   generic  just informs. "Got it" hides it for that partner.
//   custom   asks the partner to do something, with a button that does it
//            (BANNER_ACTIONS). It only shows to partners who still need to,
//            and can't be dismissed.
// To add a custom action, add its key to PageBannerAction (lib/store-types.ts)
// and an entry to BANNER_ACTIONS.

export type { PageBanner, PageBannerAction } from "./store-types";

type ActionDef = {
  /** In the admin's picker. */
  label: string;
  /** On the banner's button. */
  button: string;
  /** Toasted once it's done. */
  done: string;
  /** Whether the partner still needs to do it. The banner hides for them once this is false. */
  pending: (owner: Owner, banner: PageBanner) => boolean;
  /** Only the partner can do it, signed in as themselves: not a platform admin viewing as them. */
  accountHolderOnly: boolean;
  /** A line for this partner under the banner's text, e.g. their rate. */
  detail?: (owner: Owner) => Promise<string | null>;
  run: (owner: Owner, banner: PageBanner) => Promise<void>;
};

export const BANNER_ACTIONS: Record<PageBannerAction, ActionDef> = {
  "accept-fee-terms": {
    label: "Agree to the per-booking fee",
    button: "I agree",
    done: "Thanks, you've agreed to the fee terms.",
    pending: (o) => !o.feeTermsAcceptedAt,
    accountHolderOnly: true,
    detail: async (o) => `Your rate: ${describePartnerRate(await readFeeSchedule(), o.id, facilityNow().date)}.`,
    run: async (o) => {
      await updateOwner(o.id, (owner) => {
        owner.feeTermsAcceptedAt ??= new Date().toISOString();
      });
    },
  },
  // Asks partners to respond (e.g. "Want help setting up?"). Platform admins
  // get it in their bell only, no email. The banner hides once they respond.
  "notify-platform": {
    label: "Notify the platform team (in-app only)",
    button: "Notify the team",
    done: "Thanks, the CourtHub team has been notified.",
    pending: (o, b) => !b.dismissedBy.includes(o.id),
    accountHolderOnly: true,
    run: async (o, b) => {
      await updatePlatformNotifications((all) =>
        [
          {
            id: randomBytes(6).toString("hex"),
            kind: "banner_response" as const,
            ownerId: o.id,
            title: `${o.profile.name} responded: ${b.title}`,
            body: `@${o.handle} · ${o.email}`,
            at: new Date().toISOString(),
            readBy: [],
          },
          ...all,
        ].slice(0, MAX_KEPT),
      );
      await updatePageBanners(builtInBanners(), (all) => {
        const banner = all.find((x) => x.id === b.id);
        if (banner && !banner.dismissedBy.includes(o.id)) banner.dismissedBy.push(o.id);
      });
    },
  },
};

export const isBannerAction = (key: unknown): key is PageBannerAction => typeof key === "string" && Object.hasOwn(BANNER_ACTIONS, key);

/**
 * Shown until an admin changes the banners. Partners who joined before fees
 * never agreed to them (sign-up asks newer ones), and could miss the Billing page.
 */
export const builtInBanners = (): PageBanner[] => [
  {
    id: "fee-terms",
    kind: "custom",
    tone: "warning",
    title: "Please review the new booking fee",
    body: "CourtHub now charges partners a flat fee for each booking that's confirmed and played. There are no monthly fees, and nothing for cancelled bookings or quiet months.",
    link: { href: "/app/billing", label: "See billing details" },
    action: "accept-fee-terms",
    createdAt: "2026-11-02T00:00:00.000Z",
    createdBy: "system",
    dismissedBy: [],
  },
];

/** Every banner, live and ended, newest first. */
export function listPageBanners() {
  return readPageBanners(builtInBanners());
}

/** Not ended, and not past its last day. */
export const isLive = (b: PageBanner, today: string) => !b.endedAt && (!b.until || today <= b.until);

/** Whether the partner is who the banner is for, before dismissals and actions. */
export const inAudience = (b: PageBanner, owner: Owner) => !b.joinedBefore || facilityNow(new Date(owner.createdAt)).date < b.joinedBefore;

/** Whether the banner is meant for this partner: in its audience, not dismissed, and its action (if any) still to do. */
export function appliesTo(b: PageBanner, owner: Owner): boolean {
  if (!inAudience(b, owner)) return false;
  if (b.kind === "generic") return !b.dismissedBy.includes(owner.id);
  return !!b.action && isBannerAction(b.action) && BANNER_ACTIONS[b.action].pending(owner, b);
}

/** What the partner sees now: actions to take first, then the newest. */
export function visibleBanners(all: PageBanner[], owner: Owner, today: string): PageBanner[] {
  return all
    .filter((b) => isLive(b, today) && appliesTo(b, owner))
    .sort((a, b) => (a.kind === b.kind ? b.createdAt.localeCompare(a.createdAt) : a.kind === "custom" ? -1 : 1));
}

export async function bannersFor(owner: Owner): Promise<PageBanner[]> {
  return visibleBanners(await listPageBanners(), owner, facilityNow().date);
}

export type BannerResult = { ok: boolean; message: string };

/** Hides a generic banner for one partner. */
export function dismissBanner(id: string, owner: Owner): Promise<BannerResult> {
  return updatePageBanners(builtInBanners(), (all): BannerResult => {
    const b = all.find((x) => x.id === id);
    if (!b || b.kind !== "generic") return { ok: false, message: "That notice can't be dismissed." };
    if (!b.dismissedBy.includes(owner.id)) b.dismissedBy.push(owner.id);
    return { ok: true, message: "" };
  });
}

/** Runs a custom banner's action for the partner, if it's one they're shown. Callers check `accountHolderOnly`. */
export async function runBannerAction(id: string, owner: Owner): Promise<BannerResult> {
  const b = (await bannersFor(owner)).find((x) => x.id === id);
  if (!b || b.kind !== "custom" || !b.action) return { ok: false, message: "That's already done." };
  const action = BANNER_ACTIONS[b.action];
  await action.run(owner, b);
  return { ok: true, message: action.done };
}

export type NewBanner = Omit<PageBanner, "id" | "createdAt" | "dismissedBy" | "endedAt">;

export async function addBanner(input: NewBanner): Promise<PageBanner> {
  const banner: PageBanner = { ...input, id: randomBytes(6).toString("hex"), createdAt: new Date().toISOString(), dismissedBy: [] };
  await updatePageBanners(builtInBanners(), (all) => {
    all.unshift(banner);
  });
  return banner;
}

/** Stops showing a banner to anyone. It stays in the list, as history. */
export function endBanner(id: string): Promise<BannerResult> {
  return updatePageBanners(builtInBanners(), (all): BannerResult => {
    const b = all.find((x) => x.id === id);
    if (!b) return { ok: false, message: "Banner not found." };
    if (b.endedAt) return { ok: false, message: "That banner has already ended." };
    b.endedAt = new Date().toISOString();
    return { ok: true, message: "Banner ended. Partners no longer see it." };
  });
}
