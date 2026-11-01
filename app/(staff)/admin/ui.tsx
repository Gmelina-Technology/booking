import { isPlatformAdmin } from "@/lib/auth";
import { isNewPartner } from "@/lib/platform-stats";
import type { Owner } from "@/lib/store";
import { startViewingAs } from "./partners/actions";

// Pieces shared by the platform admin pages.

export function Stat({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${tone === "warn" ? "border-amber-200 bg-amber-50" : "border-black/5 bg-white"}`}>
      <p className={`text-sm ${tone === "warn" ? "text-amber-900/70" : "text-black/50"}`}>{label}</p>
      <p className={`mt-1 text-2xl font-bold ${tone === "warn" ? "text-amber-900" : ""}`}>{value}</p>
    </div>
  );
}

/** New, suspended and platform admin labels next to a partner's name. */
export function Badges({ owner }: { owner: Owner }) {
  return (
    <>
      {owner.suspension && <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-800">Suspended</span>}
      {isNewPartner(owner, 7) && <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-800">New</span>}
      {isPlatformAdmin(owner) && <span className="ml-2 rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-800">Admin</span>}
    </>
  );
}

export function SetupMeter({ done, total }: { done: number; total: number }) {
  const complete = done === total;
  return (
    <span className="flex items-center gap-2" title={`${done} of ${total} setup steps done`}>
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-black/10" aria-hidden>
        <span className={`block h-full rounded-full ${complete ? "bg-emerald-600" : "bg-amber-500"}`} style={{ width: `${(done / total) * 100}%` }} />
      </span>
      <span className={`text-xs ${complete ? "text-emerald-800" : "text-black/60"}`}>
        {done}/{total}
      </span>
    </span>
  );
}

/** Opens the partner's staff area as them; `next` lands on a page of it (e.g. one booking). */
export function ViewAsButton({ owner, adminId, viewingId, next, label = "View as" }: { owner: Owner; adminId: string; viewingId?: string; next?: string; label?: string }) {
  if (owner.id === adminId) return <span className="self-center px-2 text-xs text-black/40">You</span>;
  if (viewingId === owner.id && !next)
    return <span className="self-center whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">Viewing now</span>;
  return (
    <form action={startViewingAs.bind(null, owner.id, next ?? "/app")}>
      <button
        type="submit"
        className="whitespace-nowrap rounded-lg border border-black/15 px-3 py-1.5 text-xs font-semibold hover:border-emerald-600 hover:text-emerald-800"
        title={`Open the staff area as ${owner.profile.name}`}
      >
        {label}
        {!next && isPlatformAdmin(owner) ? " (admin)" : ""}
      </button>
    </form>
  );
}
