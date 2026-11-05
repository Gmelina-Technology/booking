"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { registerForHostedEvent } from "@/app/event-actions";
import { formatMoney, type HostedEventKind } from "@/lib/facility";

/** Sign-up for a hosted event: a player (with friends), or a tournament captain naming the team. */
export default function RegisterForm({
  ownerId,
  eventId,
  kind,
  price,
  fee,
  maxSpots,
  teamSize,
  online,
}: {
  ownerId: string;
  eventId: string;
  kind: HostedEventKind;
  price: number;
  fee: number;
  maxSpots: number;
  teamSize: number;
  online: boolean;
}) {
  const router = useRouter();
  const tournament = kind === "tournament";
  const [spots, setSpots] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const total = (tournament ? price : price * spots) + fee;

  function submit(form: FormData) {
    setError(null);
    // Bots fill every field, including the hidden one.
    if (form.get("website")) return;
    start(async () => {
      const result = await registerForHostedEvent(ownerId, eventId, {
        name: String(form.get("name") ?? ""),
        email: String(form.get("email") ?? ""),
        phone: String(form.get("phone") ?? ""),
        spots: tournament ? 1 : spots,
        teamName: tournament ? String(form.get("teamName") ?? "") : undefined,
        teamPlayers: tournament ? Array.from({ length: teamSize }, (_, i) => String(form.get(`player${i}`) ?? "")) : undefined,
        notes: String(form.get("notes") ?? ""),
      });
      if (result.ok) router.push(`/bookings/${result.token}`);
      else setError(result.error);
    });
  }

  return (
    <form action={submit} className="mt-5 space-y-3">
      {tournament && (
        <>
          <Field label="Team name" name="teamName" required placeholder="e.g. Net Ninjas" />
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Players ({teamSize})</legend>
            {Array.from({ length: teamSize }, (_, i) => (
              <input key={i} name={`player${i}`} required minLength={2} maxLength={60} placeholder={i === 0 ? "You (captain)" : `Player ${i + 1}`} aria-label={`Player ${i + 1}`} className={inputClass} />
            ))}
          </fieldset>
        </>
      )}
      <Field label={tournament ? "Captain's name" : "Your name"} name="name" required autoComplete="name" />
      <Field label="Email" name="email" type="email" required autoComplete="email" />
      <Field label="Phone" name="phone" type="tel" required autoComplete="tel" />
      {!tournament && maxSpots > 1 && (
        <label className="block text-sm">
          <span className="font-medium">Spots</span>
          <select value={spots} onChange={(e) => setSpots(Number(e.target.value))} className={inputClass}>
            {Array.from({ length: maxSpots }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n} {n === 1 ? "player (just me)" : "players"}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="block text-sm">
        <span className="font-medium">Note for the organiser</span> <span className="text-black/40">(optional)</span>
        <textarea name="notes" rows={2} maxLength={500} placeholder="Skill level, partner requests…" className={inputClass} />
      </label>
      <input name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />

      <dl className="space-y-1 border-t border-black/5 pt-3 text-sm">
        {(price > 0 || fee > 0) && (
          <div className="flex justify-between text-black/60">
            <dt>{tournament ? "Team entry" : `${spots} × ${formatMoney(price)}`}</dt>
            <dd>{formatMoney(tournament ? price : price * spots)}</dd>
          </div>
        )}
        {fee > 0 && (
          <div className="flex justify-between text-black/60">
            <dt>Booking fee</dt>
            <dd>{formatMoney(fee)}</dd>
          </div>
        )}
        <div className="flex justify-between text-base font-semibold">
          <dt>Total</dt>
          <dd>{total ? formatMoney(total) : "Free"}</dd>
        </div>
      </dl>

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <button type="submit" disabled={pending} className="w-full rounded-xl bg-emerald-700 px-6 py-3 font-semibold text-white hover:bg-emerald-800 disabled:opacity-60">
        {pending ? "Registering…" : tournament ? "Register team" : "Register"}
      </button>
      <p className="text-center text-xs text-black/50">
        {online && total > 0 ? "Next, you'll get the payment QR. Your spot is confirmed once the payment is checked." : "Your spot is confirmed straight away. Pay at the venue."}
      </p>
    </form>
  );
}

function Field({ label, ...input }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block text-sm">
      <span className="font-medium">{label}</span>
      <input {...input} className={inputClass} />
    </label>
  );
}

const inputClass =
  "mt-1 w-full rounded-lg border border-black/15 bg-white px-3 py-2 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20";
