import Image from "next/image";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type { BannerMoment } from "@/lib/facility";
import { isLight, MAX_HERO_IMAGES, withAlpha, type HeroAlignX, type HeroAlignY, type HeroButton, type HeroSettings } from "@/lib/hero";

// The page banner in each template. Pure rendering with no data loading, so the
// same component draws the live page (./hero.tsx) and the preview in the
// banner editor. Layout uses container queries (@3xl: etc.) rather than screen
// breakpoints, so a narrow preview box shows the phone layout.

export type HeroData = {
  businessName: string;
  sports: number;
  courts: number;
  /** e.g. "6 AM – 11 PM", or null when nothing is open. */
  hours: string | null;
  /** Bookable activities in page order; the first is "featured". */
  activities: { slug: string; name: string; href: string }[];
  /** Event and stock photos, used when the owner hasn't picked their own. */
  fallbackPhotos: BannerMoment[];
};

export default function HeroView({ settings: s, data }: { settings: HeroSettings; data: HeroData }) {
  // The owner's picks first, topped up with event and stock photos so the collage stays full.
  const photos: BannerMoment[] = [
    ...s.images.map((name) => ({ src: `/uploads/${name}`, caption: "", detail: "" })),
    ...data.fallbackPhotos,
  ].slice(0, MAX_HERO_IMAGES);
  const t = theme(s);
  const parts = { s, data, t, photos };
  return (
    <section className="@container relative isolate overflow-hidden" style={t.vars}>
      {s.template === "spotlight" ? (
        <Spotlight {...parts} />
      ) : s.template === "split" ? (
        <Split {...parts} />
      ) : s.template === "minimal" ? (
        <Minimal {...parts} />
      ) : (
        <Collage {...parts} />
      )}
    </section>
  );
}

type Theme = ReturnType<typeof theme>;
type Parts = { s: HeroSettings; data: HeroData; t: Theme; photos: BannerMoment[] };

function theme(s: HeroSettings) {
  const darkText = isLight(s.background);
  // Accent-coloured text only where it contrasts with the background.
  const accentReadable = isLight(s.accent) !== darkText;
  return {
    darkText,
    fg: darkText ? "text-stone-900" : "text-white",
    muted: darkText ? "text-stone-900/75" : "text-white/80",
    vars: {
      "--hero-bg": s.background,
      "--hero-accent": s.accent,
      "--hero-on-accent": isLight(s.accent) ? "#1c1917" : "#ffffff",
      "--hero-fg": darkText ? "#1c1917" : "#ffffff",
      "--hero-highlight": accentReadable ? s.accent : darkText ? "#1c1917" : "#ffffff",
      backgroundColor: s.background,
    } as CSSProperties,
  };
}

// ---- Templates ------------------------------------------------------------

/** Headline beside a staggered photo collage over a blurred, tinted backdrop. */
function Collage({ s, data, t, photos }: Parts) {
  const center = s.alignX === "center";
  const lead = photos[0];
  const direction = s.alignX === "right" ? "to left" : center ? "to bottom" : "to right";
  return (
    <>
      {lead && (
        <Image
          src={lead.src}
          alt=""
          fill
          unoptimized
          priority
          sizes="100vw"
          className="-z-20 scale-110 object-cover blur-sm @5xl:blur-xl"
          style={{ opacity: ((100 - s.overlay) / 100) * 0.8, objectPosition: s.imageFocus }}
        />
      )}
      <div
        className="absolute inset-0 -z-10"
        style={{
          background: `linear-gradient(${direction}, ${s.background}, ${withAlpha(s.background, 0.85)} 45%, ${withAlpha(s.background, 0.4)})`,
        }}
      />
      <div
        className="absolute inset-0 -z-10"
        style={{ background: `radial-gradient(circle at ${s.alignX === "right" ? "15%" : "85%"} 15%, ${withAlpha(s.accent, 0.25)}, transparent 45%)` }}
      />

      <div
        className={`mx-auto grid max-w-6xl items-center gap-8 px-4 py-10 @2xl:gap-12 @2xl:py-20 @5xl:py-24 ${
          center ? "" : "@5xl:grid-cols-[1fr_1.05fr]"
        }`}
      >
        <Copy s={s} data={data} t={t} className={s.alignX === "right" ? "@5xl:order-2" : ""} />
        <ul
          className={`-mx-4 flex snap-x snap-mandatory gap-4 scroll-px-4 overflow-x-auto px-4 pb-2 [scrollbar-width:none] @3xl:mx-0 @3xl:grid @3xl:grid-cols-4 @3xl:overflow-visible @3xl:px-0 @3xl:pb-0 ${
            center ? "" : "@5xl:grid-cols-2 @5xl:pb-10"
          }`}
        >
          {photos.slice(0, 4).map((m, i) => (
            <li
              key={m.src}
              className={`relative aspect-[4/5] w-[68%] max-w-64 shrink-0 snap-start overflow-hidden rounded-2xl bg-black/20 shadow-2xl ring-1 ring-white/10 @2xl:w-60 @3xl:w-auto @3xl:max-w-none ${
                center ? "" : `${i % 2 === 1 ? "@5xl:translate-y-10" : ""} ${i < 2 ? "@5xl:aspect-[4/5]" : "@5xl:aspect-[4/3]"}`
              }`}
            >
              <Photo moment={m} focus={s.imageFocus} priority={i < 2} delay={i} sizes="(min-width: 1024px) 26vw, (min-width: 768px) 25vw, 68vw" />
              {m.caption && (
                <>
                  <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-4 text-left text-white @3xl:p-3 @5xl:p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--hero-accent)] @3xl:text-[0.65rem] @5xl:text-xs">
                      {m.detail}
                    </p>
                    <p className="mt-0.5 font-semibold leading-snug @3xl:text-sm @5xl:text-base">{m.caption}</p>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

/** One full-bleed photo with the copy placed anywhere on a 3×3 grid. */
function Spotlight({ s, data, t, photos }: Parts) {
  const lead = photos[0];
  const toward = { left: "to right", center: "to top", right: "to left" }[s.alignX];
  const tint = s.overlay / 100;
  return (
    <>
      {lead && (
        <div className="absolute inset-0 -z-20">
          <Photo moment={lead} focus={s.imageFocus} priority sizes="100vw" />
        </div>
      )}
      <div
        className="absolute inset-0 -z-10"
        style={{
          background: `linear-gradient(${toward}, ${withAlpha(s.background, Math.min(1, tint + 0.25))}, ${withAlpha(
            s.background,
            tint,
          )} 55%, ${withAlpha(s.background, tint * 0.5)})`,
        }}
      />
      <div
        className={`mx-auto flex min-h-[32rem] max-w-6xl px-4 py-12 @3xl:min-h-[38rem] @3xl:py-16 ${justify[s.alignX]} ${
          { top: "items-start", center: "items-center", bottom: "items-end" }[s.alignY]
        }`}
      >
        <Copy s={s} data={data} t={t} className="max-w-2xl" />
      </div>
      {lead?.caption && (
        <p className="absolute right-4 bottom-3 hidden text-xs text-white/70 drop-shadow @3xl:block">
          {lead.caption} · {lead.detail}
        </p>
      )}
    </>
  );
}

/** Solid brand-colour panel on one side, a big photo on the other. */
function Split({ s, data, t, photos }: Parts) {
  const lead = photos[0];
  return (
    <div className="grid @3xl:min-h-[34rem] @3xl:grid-cols-2">
      <div className={`relative aspect-[16/10] overflow-hidden @3xl:aspect-auto ${s.alignX === "right" ? "" : "@3xl:order-2"}`}>
        {lead && <Photo moment={lead} focus={s.imageFocus} priority sizes="(min-width: 768px) 50vw, 100vw" />}
        <div className="absolute inset-0" style={{ backgroundColor: withAlpha(s.background, (s.overlay / 100) * 0.5) }} />
      </div>
      <div
        className={`flex px-4 py-10 @3xl:px-10 @3xl:py-16 @5xl:px-16 ${
          { top: "items-start", center: "items-center", bottom: "items-end" }[s.alignY]
        } ${s.alignX === "right" ? "@3xl:justify-start" : "@3xl:justify-end"}`}
      >
        {/* Left/right picks the panel's side; the text itself reads best left-aligned. */}
        <Copy s={{ ...s, alignX: "left" }} data={data} t={t} className="w-full max-w-xl" compact />
      </div>
    </div>
  );
}

/** No photos: big type on the brand colour, with quick facts underneath. */
function Minimal({ s, data, t }: Parts) {
  const facts = [
    data.sports > 0 && [String(data.sports), data.sports === 1 ? "sport" : "sports"],
    data.courts > 0 && [String(data.courts), "courts & tables"],
    data.hours && [data.hours, "open daily"],
  ].filter(Boolean) as string[][];
  return (
    <>
      <div
        className="absolute inset-0 -z-10"
        style={{
          background: `radial-gradient(ellipse at ${s.alignX === "center" ? "50% 0%" : "100% 0%"}, ${withAlpha(
            s.accent,
            0.22,
          )}, transparent 60%)`,
        }}
      />
      <div className="mx-auto max-w-6xl px-4 py-14 @3xl:py-24">
        <Copy s={s} data={data} t={t} className={s.alignX === "center" ? "mx-auto max-w-3xl" : "max-w-3xl"} large />
        {facts.length > 0 && (
          <dl className={`mt-10 flex flex-wrap gap-3 @3xl:mt-14 ${justify[s.alignX]}`}>
            {facts.map(([value, label]) => (
              <div
                key={label}
                className={`rounded-2xl px-5 py-3 ring-1 ${t.darkText ? "bg-black/5 ring-black/10" : "bg-white/5 ring-white/15"}`}
              >
                <dt className={`text-xs uppercase tracking-wider ${t.muted}`}>{label}</dt>
                <dd className={`text-xl font-bold ${t.fg}`}>{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </>
  );
}

// ---- Shared pieces --------------------------------------------------------

const justify: Record<HeroAlignX, string> = { left: "justify-start", center: "justify-center", right: "justify-end" };
const textAlign: Record<HeroAlignX, string> = { left: "text-left", center: "text-center", right: "text-right" };

/** Eyebrow, headline, subheadline and buttons. */
function Copy({
  s,
  data,
  t,
  className = "",
  compact,
  large,
}: {
  s: HeroSettings;
  data: HeroData;
  t: Theme;
  className?: string;
  compact?: boolean;
  large?: boolean;
}) {
  const align = s.alignX;
  const eyebrow = s.eyebrow || `${data.sports} sports · ${data.courts} courts & tables`;
  const sub =
    s.subheadline ||
    `Pick a sport, choose a court and time, and you're in.${data.hours ? ` Open daily ${data.hours}.` : ""}`;
  const headlineSize = large
    ? "text-[2.75rem] @2xl:text-6xl @5xl:text-7xl"
    : compact
      ? "text-[2.25rem] @2xl:text-5xl"
      : "text-[2.5rem] @2xl:text-6xl";
  return (
    <div className={`${textAlign[align]} ${className}`}>
      {s.showEyebrow && (
        <p
          className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider text-[var(--hero-highlight)] backdrop-blur @2xl:text-sm @2xl:tracking-widest ${
            t.darkText ? "bg-black/5" : "bg-white/10"
          }`}
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--hero-accent)] opacity-75 motion-reduce:hidden" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--hero-accent)]" />
          </span>
          {eyebrow}
        </p>
      )}
      <h1
        className={`${s.showEyebrow ? "mt-4 @2xl:mt-5" : ""} max-w-2xl leading-[1.05] font-bold tracking-tight ${t.fg} ${headlineSize} ${
          align === "center" ? "mx-auto" : align === "right" ? "ml-auto" : ""
        }`}
      >
        <Headline text={s.headline || "Book your game at {name}"} name={data.businessName} />
      </h1>
      <p
        className={`mt-4 max-w-xl text-base @2xl:mt-5 @2xl:text-lg ${t.muted} ${
          align === "center" ? "mx-auto" : align === "right" ? "ml-auto" : ""
        }`}
      >
        {sub}
      </p>
      <Buttons s={s} data={data} t={t} />
    </div>
  );
}

/** Highlights the business name wherever "{name}" appears in the headline. */
function Headline({ text, name }: { text: string; name: string }) {
  const pieces = text.split("{name}");
  return pieces.map((piece, i) => (
    <span key={i}>
      {piece}
      {i < pieces.length - 1 && <span className="text-[var(--hero-highlight)]">{name}</span>}
    </span>
  ));
}

function Buttons({ s, data, t }: { s: HeroSettings; data: HeroData; t: Theme }) {
  const primary = resolve(s.primary, data, true);
  const secondary = s.secondary.show ? resolve(s.secondary, data, false) : null;
  if (!primary && !secondary) return null;

  const shape = { square: "rounded-md", rounded: "rounded-xl", pill: "rounded-full" }[s.buttonShape];
  const size = { md: "px-5 py-2.5 text-sm", lg: "px-7 py-3.5 text-base" }[s.buttonSize];
  const base = `inline-block text-center font-semibold transition ${shape} ${size}`;
  const main = {
    solid: "bg-[var(--hero-accent)] text-[var(--hero-on-accent)] shadow-lg hover:brightness-110",
    outline:
      "border-2 border-[var(--hero-accent)] text-[var(--hero-highlight)] hover:bg-[var(--hero-accent)] hover:text-[var(--hero-on-accent)]",
    soft: `${t.darkText ? "bg-black/10" : "bg-white/15"} text-[var(--hero-highlight)] backdrop-blur hover:bg-[var(--hero-accent)] hover:text-[var(--hero-on-accent)]`,
  }[s.buttonVariant];
  const quiet =
    s.buttonVariant === "outline"
      ? `${t.fg} underline-offset-4 hover:underline`
      : `border ${t.darkText ? "border-black/20 hover:bg-black/5" : "border-white/30 hover:bg-white/10"} ${t.fg} backdrop-blur`;

  return (
    <div className={`mt-6 flex flex-col gap-3 @2xl:mt-8 @2xl:flex-row @2xl:flex-wrap ${justify[s.alignX]}`}>
      {primary && (
        <ButtonLink href={primary.href} className={`${base} ${main}`}>
          {primary.label}
        </ButtonLink>
      )}
      {secondary && (
        <ButtonLink href={secondary.href} className={`${base} ${quiet}`}>
          {secondary.label}
        </ButtonLink>
      )}
    </div>
  );
}

function ButtonLink({ href, className, children }: { href: string; className: string; children: ReactNode }) {
  return href.startsWith("#") ? (
    <a href={href} className={className}>
      {children}
    </a>
  ) : (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

/** Where a button goes and what it says. Null when it points at nothing bookable. */
function resolve(button: HeroButton, data: HeroData, primary: boolean): { href: string; label: string } | null {
  if (button.target === "activities") return { href: "#activities", label: button.label || "See all activities" };
  const activity = data.activities.find((a) => a.slug === button.target) ?? data.activities[0];
  if (!activity) return primary ? { href: "#activities", label: button.label || "See all activities" } : null;
  return { href: activity.href, label: button.label || `Book ${activity.name.toLowerCase()}` };
}

function Photo({
  moment,
  focus,
  priority,
  delay = 0,
  sizes,
}: {
  moment: BannerMoment;
  focus: HeroAlignY;
  priority?: boolean;
  delay?: number;
  sizes: string;
}) {
  return (
    <Image
      src={moment.src}
      alt={moment.caption ? `${moment.caption}${moment.detail ? ` — ${moment.detail}` : ""}` : ""}
      fill
      unoptimized
      priority={priority}
      sizes={sizes}
      className="animate-kenburns object-cover"
      style={{ animationDelay: `${delay * -4}s`, objectPosition: focus }}
    />
  );
}
