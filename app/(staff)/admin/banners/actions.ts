"use server";

import { refresh } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth";
import { addBanner, endBanner, isBannerAction, type BannerResult, type NewBanner } from "@/lib/page-banners";
import { facilityNow, isValidDate } from "@/lib/time";

// Platform-admin only: each action starts with requirePlatformAdmin().

const text = (form: FormData, key: string, max: number) => String(form.get(key) ?? "").trim().slice(0, max);

/** A page in the app ("/app/billing") or a secure outside link. */
const isSafeHref = (href: string) => (href.startsWith("/") && !href.startsWith("//")) || /^https:\/\/[^\s]+$/.test(href);

export async function createBanner(form: FormData): Promise<BannerResult> {
  const admin = await requirePlatformAdmin();
  const today = facilityNow().date;

  const kind = form.get("kind") === "custom" ? "custom" : "generic";
  const tone = form.get("tone") === "warning" ? "warning" : "info";
  const title = text(form, "title", 120);
  const body = text(form, "body", 600);
  const linkLabel = text(form, "linkLabel", 60);
  const linkHref = text(form, "linkHref", 300);
  const action = form.get("action");
  const joinedBefore = text(form, "joinedBefore", 10) || undefined;
  const until = text(form, "until", 10) || undefined;

  if (!title || !body) return { ok: false, message: "Give the banner a title and a message." };
  if (kind === "custom" && !isBannerAction(action)) return { ok: false, message: "Pick what the banner's button does." };
  if (!!linkLabel !== !!linkHref) return { ok: false, message: "A link needs both its text and where it goes." };
  if (linkHref && !isSafeHref(linkHref)) return { ok: false, message: "Links go to a page here (starting with /) or an https:// address." };
  if (joinedBefore && !isValidDate(joinedBefore)) return { ok: false, message: "Enter a valid sign-up date." };
  if (until && (!isValidDate(until) || until < today)) return { ok: false, message: "The last day can't be in the past." };

  const banner: NewBanner = {
    kind,
    tone,
    title,
    body,
    ...(linkHref && { link: { href: linkHref, label: linkLabel } }),
    ...(kind === "custom" && isBannerAction(action) && { action }),
    ...(joinedBefore && { joinedBefore }),
    ...(until && { until }),
    createdBy: admin.email,
  };
  await addBanner(banner);
  refresh();
  return { ok: true, message: "Banner posted. Partners see it on their next page." };
}

export async function endPageBanner(id: string): Promise<BannerResult> {
  await requirePlatformAdmin();
  const result = await endBanner(id);
  refresh();
  return result;
}
