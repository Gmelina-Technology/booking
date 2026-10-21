import { cacheLife, cacheTag } from "next/cache";
import type { HeroData } from "@/app/p/[handle]/hero-view";
import { getPublishedEvents, photoUrl } from "./events";
import { defaultBannerMoments, formatHour, type Activity, type BannerMoment } from "./facility";
import { normalizeHeroSettings, type HeroSettings } from "./hero";
import { ownerPath, type PublicOwner } from "./owners";
import { readHero } from "./store";
import { formatDate } from "./time";

/** Cache tag for one owner's banner settings. */
export const heroTag = (ownerId: string) => `hero:${ownerId}`;

/** The owner's banner settings. Cached until they save the banner editor. */
export async function getHeroSettings(ownerId: string): Promise<HeroSettings> {
  "use cache";
  cacheLife("max");
  cacheTag(heroTag(ownerId));
  const doc = await readHero(ownerId);
  return normalizeHeroSettings(doc.settings, doc.library ?? []);
}

/** Everything the banner shows besides the owner's settings. */
export async function getHeroData(owner: PublicOwner, activities: Activity[]): Promise<HeroData> {
  return {
    businessName: owner.profile.name,
    sports: activities.length,
    courts: activities.reduce((n, a) => n + a.resources.length, 0),
    hours: activities.length
      ? `${formatHour(Math.min(...activities.map((a) => a.openHour)))} – ${formatHour(Math.max(...activities.map((a) => a.closeHour)))}`
      : null,
    activities: activities.map((a) => ({ slug: a.slug, name: a.name, href: ownerPath(owner.handle, `/activities/${a.slug}`) })),
    fallbackPhotos: await getMoments(owner.id, activities),
  };
}

const MOMENTS = 4;

/** Published event photos first (newest first), topped up with the stock moments. */
async function getMoments(ownerId: string, activities: Activity[]): Promise<BannerMoment[]> {
  const events = await getPublishedEvents(ownerId);
  const fromEvents = events
    .filter((e) => e.photo)
    .map((e) => ({
      src: photoUrl(e.photo!),
      caption: e.title,
      detail: [
        activities.find((a) => a.slug === e.activitySlug)?.name,
        formatDate(e.date, { weekday: undefined, day: undefined, month: "short", year: "numeric" }),
      ]
        .filter(Boolean)
        .join(" · "),
    }));
  return [...fromEvents, ...defaultBannerMoments].slice(0, MOMENTS);
}
