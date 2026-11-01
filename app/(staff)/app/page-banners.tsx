import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { currentOwner, currentViewingAs } from "@/lib/auth";
import { BANNER_ACTIONS, bannersFor } from "@/lib/page-banners";
import { BannerButtons } from "./page-banner-buttons";

const tones = {
  info: { box: "border-blue-200 bg-blue-50 text-blue-950", muted: "text-blue-900/80" },
  warning: { box: "border-amber-200 bg-amber-50 text-amber-950", muted: "text-amber-900/80" },
};

/**
 * The platform's notices for the signed-in partner (lib/page-banners.ts). Every
 * dashboard page puts this first in its content column, so the banners line up
 * with the page however wide it is.
 */
export function PageBanners() {
  return (
    <Suspense>
      <Banners />
    </Suspense>
  );
}

async function Banners() {
  await connection();
  const owner = await currentOwner();
  if (!owner) return null;
  const [banners, viewing] = await Promise.all([bannersFor(owner), currentViewingAs()]);
  if (banners.length === 0) return null;
  const details = await Promise.all(banners.map((b) => (b.action ? BANNER_ACTIONS[b.action].detail?.(owner) : null)));

  return (
    <div className="mb-6 space-y-3">
      {banners.map((b, i) => {
        const tone = tones[b.tone];
        const action = b.action ? BANNER_ACTIONS[b.action] : null;
        const blocked = !!viewing && (b.kind === "generic" || !!action?.accountHolderOnly);
        return (
          <section key={b.id} role="status" aria-label={b.title} className={`rounded-2xl border px-4 py-3 text-sm shadow-sm ${tone.box}`}>
            <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
              <div className="min-w-0 max-w-3xl">
                <p className="font-semibold">{b.title}</p>
                <p className={`mt-0.5 ${tone.muted}`}>
                  {b.body}
                  {details[i] && <strong className="font-semibold"> {details[i]}</strong>}
                </p>
                {b.link && (
                  <Link href={b.link.href} className="mt-1 inline-block font-medium underline underline-offset-2 hover:no-underline">
                    {b.link.label} →
                  </Link>
                )}
              </div>
              {blocked ? (
                <p className={`text-xs ${tone.muted}`}>
                  {b.kind === "generic" ? "Shown to the partner until they dismiss it." : "Only the partner can do this, signed in as themselves."}
                </p>
              ) : (
                <BannerButtons id={b.id} action={action?.button ?? null} />
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
