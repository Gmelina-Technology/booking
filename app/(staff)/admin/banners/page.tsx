import { connection } from "next/server";
import { Suspense } from "react";
import { requirePlatformAdmin } from "@/lib/auth";
import { appliesTo, BANNER_ACTIONS, inAudience, isBannerAction, isLive, listPageBanners, type PageBanner } from "@/lib/page-banners";
import { listOwners, type Owner } from "@/lib/store";
import { facilityNow, formatDate } from "@/lib/time";
import { PageHeader } from "../../app/page-header";
import CreateBanner from "./create-banner";
import { EndBannerButton } from "./end-button";

export const metadata = { title: "Platform — page banners" };

const subtitle =
  "Notices at the top of every page of partners' dashboards, for things they shouldn't miss. A generic banner just informs; a custom one asks them to do something and stays until they have.";

export default function PageBannersPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <Suspense
        fallback={
          <>
            <PageHeader title="Page banners" subtitle={subtitle} />
            <div className="mt-8 h-96 animate-pulse rounded-2xl bg-black/5" />
          </>
        }
      >
        <Banners />
      </Suspense>
    </div>
  );
}

async function Banners() {
  await connection();
  await requirePlatformAdmin();
  const [banners, owners] = await Promise.all([listPageBanners(), listOwners()]);
  const today = facilityNow().date;
  const live = banners.filter((b) => isLive(b, today));
  const past = banners.filter((b) => !isLive(b, today));

  return (
    <>
      <PageHeader title="Page banners" subtitle={subtitle}>
        <CreateBanner actions={Object.entries(BANNER_ACTIONS).map(([key, a]) => ({ key, label: a.label }))} today={today} />
      </PageHeader>
      <div className="mt-8 space-y-8">
        <BannerList title="Showing now" empty="No banners are showing." banners={live} owners={owners} live />
        {past.length > 0 && <BannerList title="Ended" empty="" banners={past} owners={owners} />}
      </div>
    </>
  );
}

/** A timestamp's day where the platform is. */
const day = (iso: string) => formatDate(facilityNow(new Date(iso)).date, { year: "numeric" });

/** How far the banner has got: who still sees it, and who dismissed it or did what it asks. */
function reach(b: PageBanner, owners: Owner[], live: boolean) {
  if (!live) return b.kind === "generic" ? `${b.dismissedBy.length} dismissed it` : null;
  const audience = owners.filter((o) => inAudience(b, o));
  const seeing = audience.filter((o) => appliesTo(b, o)).length;
  if (b.kind === "generic") return `${seeing} of ${audience.length} partners see it · ${b.dismissedBy.length} dismissed it`;
  return `${seeing} of ${audience.length} partners still to do it`;
}

function BannerList({ title, empty, banners, owners, live }: { title: string; empty: string; banners: PageBanner[]; owners: Owner[]; live?: boolean }) {
  return (
    <section>
      <h2 className="text-lg font-semibold">{title}</h2>
      {banners.length === 0 ? (
        <p className="mt-3 rounded-2xl bg-white p-6 text-center text-sm text-black/50">{empty}</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {banners.map((b) => (
            <li key={b.id} className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2">
                  <span className={`size-2 rounded-full ${b.tone === "warning" ? "bg-amber-500" : "bg-blue-500"}`} aria-hidden />
                  <span className="font-semibold">{b.title}</span>
                  <span className="rounded-full bg-black/5 px-2 py-0.5 text-[11px] font-semibold text-black/60">
                    {b.kind === "custom" ? `Custom · ${isBannerAction(b.action) ? BANNER_ACTIONS[b.action].label : "action no longer available"}` : "Generic"}
                  </span>
                </p>
                <p className="mt-1 text-sm text-black/70">{b.body}</p>
                {b.link && (
                  <p className="mt-1 text-xs text-black/50">
                    Link: {b.link.label} → {b.link.href}
                  </p>
                )}
                <p className="mt-2 text-xs text-black/50">
                  {[
                    b.joinedBefore && `Partners who joined before ${formatDate(b.joinedBefore, { year: "numeric" })}`,
                    b.until && `Until ${formatDate(b.until, { year: "numeric" })}`,
                    b.endedAt && `Ended ${day(b.endedAt)}`,
                    `By ${b.createdBy === "system" ? "CourtHub (built in)" : b.createdBy}, ${day(b.createdAt)}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <p className="mt-1 text-xs font-medium text-emerald-800">{reach(b, owners, !!live)}</p>
              </div>
              {live && <EndBannerButton id={b.id} />}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
