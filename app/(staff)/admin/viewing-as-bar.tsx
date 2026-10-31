import { connection } from "next/server";
import { currentViewingAs } from "@/lib/auth";
import { platform } from "@/lib/facility";
import { stopViewingAs } from "./partners/actions";

/** Shown on every staff page while a platform admin is viewing as a partner, so it's never mistaken for their own account. */
export default async function ViewingAsBar() {
  await connection();
  const viewing = await currentViewingAs();
  if (!viewing) return null;
  const until = viewing.expires.toLocaleTimeString(platform.locale, { timeZone: platform.timeZone, timeStyle: "short" });
  // On wider screens it stays one 2.5rem line, the height globals.css adds to --staff-header.
  return (
    <div role="status" data-viewing-as className="border-t border-amber-300 bg-amber-100 text-amber-950">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2 text-sm md:h-10 md:flex-nowrap md:px-5 md:py-0">
        <p className="min-w-0 md:truncate">
          Viewing as <strong>{viewing.partner.profile.name}</strong> (@{viewing.partner.handle}). Changes you make are made on their account. Ends at{" "}
          {until}.
        </p>
        <form action={stopViewingAs} className="shrink-0">
          <button type="submit" className="whitespace-nowrap rounded-lg bg-amber-900 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-950">
            Stop viewing as
          </button>
        </form>
      </div>
    </div>
  );
}
