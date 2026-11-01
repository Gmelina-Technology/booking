"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { currentViewingAs, platformAdminEmails, requireOwner } from "@/lib/auth";
import { BANNER_ACTIONS, dismissBanner, listPageBanners, runBannerAction, type BannerResult } from "@/lib/page-banners";
import { siteUrl } from "@/lib/site-url";

// The buttons on the page banners (page-banners.tsx), scoped to the signed-in
// partner. A platform admin viewing as a partner can't dismiss a notice for
// them, or take an action only the partner may (accountHolderOnly).

const NOT_WHILE_VIEWING = "Only the partner can do this, signed in as themselves.";

export async function dismissPageBanner(id: string): Promise<BannerResult> {
  const owner = await requireOwner();
  if (await currentViewingAs()) return { ok: false, message: NOT_WHILE_VIEWING };
  const result = await dismissBanner(id, owner);
  refresh();
  return result;
}

export async function takePageBannerAction(id: string): Promise<BannerResult> {
  const owner = await requireOwner();
  const banner = (await listPageBanners()).find((b) => b.id === id);
  if (banner?.action && BANNER_ACTIONS[banner.action]?.accountHolderOnly && (await currentViewingAs())) return { ok: false, message: NOT_WHILE_VIEWING };
  const result = await runBannerAction(id, owner, { baseUrl: await siteUrl(), adminEmails: platformAdminEmails(), after });
  refresh();
  return result;
}
