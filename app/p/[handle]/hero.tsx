import Image from "next/image";
import Link from "next/link";
import { getPublishedEvents, photoUrl } from "@/lib/events";
import { defaultBannerMoments, formatHour, type Activity, type BannerMoment } from "@/lib/facility";
import { ownerPath, type PublicOwner } from "@/lib/owners";
import { formatDate } from "@/lib/time";

const MOMENTS = 4;

/** Business page banner: headline and booking CTA over a collage of moments at the facility. */
export default async function Hero({ owner, activities }: { owner: PublicOwner; activities: Activity[] }) {
  const moments = await getMoments(owner.id, activities);
  const totalCourts = activities.reduce((n, a) => n + a.resources.length, 0);
  const earliest = Math.min(...activities.map((a) => a.openHour));
  const latest = Math.max(...activities.map((a) => a.closeHour));
  const featured = activities[0];
  const [lead] = moments;

  return (
    <section className="relative isolate overflow-hidden bg-emerald-950 text-white">
      {/* Backdrop: the lead photo, blurred and tinted so the copy stays readable. */}
      <Image
        src={lead.src}
        alt=""
        fill
        unoptimized
        priority
        sizes="100vw"
        className="-z-20 scale-110 object-cover opacity-50 blur-sm lg:opacity-30 lg:blur-xl"
      />
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-emerald-950 via-emerald-950/85 to-emerald-950/40" />
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_85%_15%,rgba(190,242,100,0.25),transparent_45%)]" />

      <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-10 sm:gap-12 sm:py-20 lg:py-24 lg:grid-cols-[1fr_1.05fr]">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider sm:text-sm sm:tracking-widest text-lime-300 backdrop-blur">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-lime-300 opacity-75 motion-reduce:hidden" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-lime-300" />
            </span>
            {activities.length} sports · {totalCourts} courts &amp; tables
          </p>
          <h1 className="mt-4 max-w-2xl text-[2.5rem] leading-[1.05] font-bold tracking-tight sm:mt-5 sm:text-6xl">
            Book your game at <span className="text-lime-300">{owner.profile.name}</span>
          </h1>
          <p className="mt-4 max-w-xl text-base text-white/80 sm:mt-5 sm:text-lg">
            Pick a sport, choose a court and time, and you&apos;re in.
            {activities.length > 0 && ` Open daily ${formatHour(earliest)} – ${formatHour(latest)}.`}
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:mt-8 sm:flex-row sm:flex-wrap">
            {featured && (
              <Link
                href={ownerPath(owner.handle, `/activities/${featured.slug}`)}
                className="rounded-xl bg-lime-300 px-6 py-3 text-center font-semibold text-emerald-950 shadow-lg shadow-lime-300/20 hover:bg-lime-200"
              >
                Book {featured.name.toLowerCase()}
              </Link>
            )}
            <a href="#activities" className="rounded-xl border border-white/30 px-6 py-3 text-center font-semibold backdrop-blur hover:bg-white/10">
              See all activities
            </a>
          </div>
        </div>

        {/* Phone: swipeable strip. Tablet: row of four. Desktop: staggered two-column collage. */}
        <ul className="-mx-4 flex snap-x snap-mandatory gap-4 scroll-px-4 overflow-x-auto px-4 pb-2 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-4 md:overflow-visible md:px-0 md:pb-0 lg:grid-cols-2 lg:pb-10">
          {moments.map((m, i) => (
            <li
              key={m.src}
              className={`relative aspect-[4/5] w-[68%] max-w-64 shrink-0 snap-start overflow-hidden rounded-2xl bg-emerald-900 shadow-2xl ring-1 ring-white/10 sm:w-60 md:w-auto md:max-w-none ${
                i % 2 === 1 ? "lg:translate-y-10" : ""
              } ${i < 2 ? "lg:aspect-[4/5]" : "lg:aspect-[4/3]"}`}
            >
              <Image
                src={m.src}
                alt={`${m.caption} — ${m.detail}`}
                fill
                unoptimized
                priority={i < 2}
                sizes="(min-width: 1024px) 26vw, (min-width: 768px) 25vw, 68vw"
                className="animate-kenburns object-cover"
                style={{ animationDelay: `${i * -4}s` }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-4 md:p-3 lg:p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-lime-300 md:text-[0.65rem] lg:text-xs">{m.detail}</p>
                <p className="mt-0.5 font-semibold leading-snug md:text-sm lg:text-base">{m.caption}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

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
