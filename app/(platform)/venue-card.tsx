import Image from "next/image";
import Link from "next/link";
import { formatDistance } from "@/lib/geo";
import type { Venue } from "@/lib/venues";

/** One venue in the directory: cover, name, address and activities. `km` adds "2.3 km away". */
export default function VenueCard({ venue: v, km }: { venue: Venue; km?: number }) {
  return (
    <Link
      href={v.href}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-black/5 bg-[#f7f8f4] transition hover:-translate-y-0.5 hover:shadow-lg"
    >
      {v.cover ? (
        <span className="relative h-32">
          <Image src={v.cover} alt="" fill unoptimized sizes="(min-width: 1024px) 384px, (min-width: 640px) 50vw, 100vw" className="object-cover" />
        </span>
      ) : (
        <span className="grid h-32 place-items-center bg-gradient-to-br from-lime-400 to-emerald-600 text-4xl font-bold text-white" aria-hidden>
          {v.name.trim()[0]?.toUpperCase() ?? "?"}
        </span>
      )}
      <div className="flex flex-1 flex-col p-5">
        <h3 className="truncate text-lg font-semibold">{v.name}</h3>
        <p className="truncate text-sm text-black/60">@{v.handle}</p>
        {km !== undefined && <p className="mt-1 text-sm font-semibold text-emerald-700">{formatDistance(km)} away</p>}
        {v.tagline && <p className="mt-2 text-sm text-black/70">{v.tagline}</p>}
        {v.address && <p className="mt-1 text-sm text-black/60">{v.address}</p>}
        {v.activities.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {v.activities.map((a) => (
              <li key={a} className="rounded-full bg-white px-2.5 py-0.5 text-xs font-medium text-black/70">
                {a}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-auto pt-4 text-sm font-semibold text-emerald-700 group-hover:underline">Book →</p>
      </div>
    </Link>
  );
}
