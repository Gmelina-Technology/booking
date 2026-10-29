import { platform } from "@/lib/facility";
import { formatDate } from "@/lib/time";

// Shared layout for /privacy and /terms. Their wording is a starting template:
// have it reviewed for your business before launch, and set `operator`,
// `privacyEmail` and `legalUpdated` in lib/facility.ts.

export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12 text-[15px] leading-relaxed text-black/80 [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-black [&_li]:mt-1 [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6">
      <h1 className="text-3xl font-bold tracking-tight text-black">{title}</h1>
      <p className="text-sm text-black/50">Last updated {formatDate(platform.legalUpdated, { weekday: undefined, month: "long", year: "numeric" })}</p>
      {children}
    </article>
  );
}

export function PrivacyContact() {
  return (
    <a href={`mailto:${platform.privacyEmail}`} className="font-semibold text-emerald-700 hover:underline">
      {platform.privacyEmail}
    </a>
  );
}
