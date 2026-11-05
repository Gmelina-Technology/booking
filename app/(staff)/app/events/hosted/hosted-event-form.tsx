"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "@/app/toaster";
import { EVENT_KINDS, formatMinute } from "@/lib/event-schedule";
import type { Activity, HostedEvent, HostedEventKind } from "@/lib/facility";
import { resizeImage } from "@/lib/resize-image";
import { saveHostedEvent } from "./actions";

export type FormActivity = Pick<Activity, "slug" | "name" | "resourceLabel" | "openHour" | "closeHour" | "resources">;

const halfHours = (from: number, to: number) => Array.from({ length: (to - from) / 30 + 1 }, (_, i) => from + i * 30);

export default function HostedEventForm({
  event,
  activities,
  today,
  paymentReady,
  registered,
}: {
  event?: HostedEvent;
  activities: FormActivity[];
  today: string;
  /** A payment QR or account number is set, so players can pay online. */
  paymentReady: boolean;
  /** Spots already taken: the schedule, price and payment are fixed once anyone registers. */
  registered: number;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<HostedEventKind>(event?.kind ?? "open_play");
  const [slug, setSlug] = useState(event?.activitySlug ?? activities[0]?.slug ?? "");
  const activity = activities.find((a) => a.slug === slug);
  const open = (activity?.openHour ?? 6) * 60;
  const close = (activity?.closeHour ?? 22) * 60;
  const [start, setStart] = useState(event?.startMinute ?? Math.min(Math.max(18 * 60, open), close - 60));
  const [end, setEnd] = useState(event?.endMinute ?? Math.min(start + 120, close));
  const [courts, setCourts] = useState<string[]>(event?.resourceIds ?? activity?.resources.slice(0, 1).map((r) => r.id) ?? []);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(event?.photo ? `/uploads/${event.photo}` : null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [saving, startSaving] = useTransition();
  const locked = registered > 0;
  const tournament = kind === "tournament";
  const isDraft = !event || event.status === "draft";

  useEffect(() => {
    if (!preview?.startsWith("blob:")) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  function pickActivity(next: string) {
    const a = activities.find((x) => x.slug === next);
    setSlug(next);
    setCourts(a?.resources.slice(0, 1).map((r) => r.id) ?? []);
    if (a) {
      const s = Math.min(Math.max(start, a.openHour * 60), a.closeHour * 60 - 30);
      setStart(s);
      setEnd(Math.min(Math.max(end, s + 30), a.closeHour * 60));
    }
  }

  function pickStart(next: number) {
    setStart(next);
    if (end <= next) setEnd(Math.min(next + 60, close));
  }

  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    setProcessing(true);
    try {
      const resized = await resizeImage(file);
      setPhoto(resized);
      setPreview(URL.createObjectURL(resized));
      setRemovePhoto(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't read that photo.");
    } finally {
      setProcessing(false);
    }
  }

  function clearPhoto() {
    setPhoto(null);
    setPreview(null);
    setRemovePhoto(true);
    if (fileInput.current) fileInput.current.value = "";
  }

  function submit(form: FormData, publish: boolean) {
    form.delete("photoPicker");
    if (photo) form.set("photo", photo);
    if (removePhoto) form.set("removePhoto", "1");
    startSaving(async () => {
      const result = await saveHostedEvent(event?.id ?? null, form, publish);
      if (result.ok) {
        toast.success(result.message ?? "Saved.");
        router.push(`/app/events/hosted/${result.id}`);
      } else {
        toast.error(result.error);
        // A new event that saved but didn't publish is now a draft: open it so a retry doesn't make a second one.
        if (!event && result.error.startsWith("Saved as a draft")) router.push("/app/events");
      }
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        submit(new FormData(e.currentTarget), submitter?.value === "publish");
      }}
      className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]"
    >
      <div className="min-w-0 space-y-6">
        {locked && (
          <>
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              {registered} spot{registered === 1 ? " is" : "s are"} taken, so the date, time, courts, price and payment are fixed. You can still change
              the title, description, photo, spots and when registration closes.
            </p>
            {/* Disabled fields aren't submitted, so send the fixed values here (outside any disabled fieldset, which would disable these too). */}
            <input type="hidden" name="kind" value={kind} />
            <input type="hidden" name="activitySlug" value={slug} />
            <input type="hidden" name="startMinute" value={start} />
            <input type="hidden" name="endMinute" value={end} />
            <input type="hidden" name="payment" value={event?.payment} />
            {courts.map((c) => (
              <input key={c} type="hidden" name="resourceIds" value={c} />
            ))}
          </>
        )}

        <Section title="What">
          <fieldset disabled={locked}>
            <legend className="text-sm font-medium">Kind of event</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {EVENT_KINDS.map((k) => (
                <label
                  key={k.kind}
                  className={`flex cursor-pointer items-start gap-2 rounded-xl border p-3 text-sm has-[:disabled]:cursor-not-allowed ${kind === k.kind ? "border-emerald-600 bg-emerald-50" : "border-black/10"}`}
                >
                  <input type="radio" name="kind" value={k.kind} checked={kind === k.kind} onChange={() => setKind(k.kind)} className="mt-0.5 accent-emerald-700" />
                  <span>
                    <span className="font-medium">{k.label}</span>
                    <span className="block text-black/50">{KIND_HINTS[k.kind]}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <label className="block text-sm">
            <span className="font-medium">Title</span>
            <input name="title" defaultValue={event?.title} required maxLength={80} placeholder={TITLE_HINTS[kind]} className={inputClass} />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Description</span>
            <textarea
              name="description"
              rows={4}
              maxLength={1000}
              defaultValue={event?.description}
              placeholder="Who it's for, the format, what to bring. For a workshop, name the coach."
              className={inputClass}
            />
          </label>
        </Section>

        <Section title="When and where">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium">Activity</span>
              <select name="activitySlug" value={slug} onChange={(e) => pickActivity(e.target.value)} disabled={locked} className={inputClass}>
                {activities.map((a) => (
                  <option key={a.slug} value={a.slug}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-medium">Date</span>
              <input name="date" type="date" min={today} defaultValue={event?.date} required readOnly={locked} className={inputClass} />
            </label>
            <label className="block text-sm">
              <span className="font-medium">Starts</span>
              <select name="startMinute" value={start} onChange={(e) => pickStart(Number(e.target.value))} disabled={locked} className={inputClass}>
                {halfHours(open, close - 30).map((m) => (
                  <option key={m} value={m}>
                    {formatMinute(m)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-medium">Ends</span>
              <select name="endMinute" value={end} onChange={(e) => setEnd(Number(e.target.value))} disabled={locked} className={inputClass}>
                {halfHours(start + 30, close).map((m) => (
                  <option key={m} value={m}>
                    {formatMinute(m)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <fieldset disabled={locked}>
            <legend className="text-sm font-medium">{activity?.resourceLabel ?? "Court"}s to hold</legend>
            <p className="text-xs text-black/50">
              Held for {formatMinute(Math.floor(start / 60) * 60)} – {formatMinute(Math.ceil(end / 60) * 60)} once published, so nobody can book them.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {activity?.resources.map((r) => (
                <label
                  key={r.id}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${courts.includes(r.id) ? "border-emerald-600 bg-emerald-50" : "border-black/10"}`}
                >
                  <input
                    type="checkbox"
                    name="resourceIds"
                    value={r.id}
                    checked={courts.includes(r.id)}
                    onChange={(e) => setCourts(e.target.checked ? [...courts, r.id] : courts.filter((c) => c !== r.id))}
                    className="accent-emerald-700"
                  />
                  {r.name}
                </label>
              ))}
            </div>
          </fieldset>
        </Section>

        <Section title="Spots and price">
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block text-sm">
              <span className="font-medium">{tournament ? "Teams" : "Players"}</span>
              <input name="capacity" type="number" min={Math.max(1, registered)} max={500} defaultValue={event?.capacity ?? (tournament ? 8 : 16)} required className={inputClass} />
            </label>
            {tournament ? (
              <label className="block text-sm">
                <span className="font-medium">Players per team</span>
                <input name="teamSize" type="number" min={1} max={12} defaultValue={event?.teamSize ?? 2} required readOnly={locked} className={inputClass} />
              </label>
            ) : (
              <label className="block text-sm">
                <span className="font-medium">Most spots per sign-up</span>
                <input name="maxSpotsPerRegistration" type="number" min={1} max={500} defaultValue={event?.maxSpotsPerRegistration ?? 4} required className={inputClass} />
              </label>
            )}
            <label className="block text-sm">
              <span className="font-medium">Price {tournament ? "per team" : "per player"} (₱)</span>
              <input name="price" type="number" min={0} max={100000} defaultValue={event?.price ?? 0} required readOnly={locked} className={inputClass} />
            </label>
          </div>
          <fieldset disabled={locked} className="space-y-2">
            <legend className="text-sm font-medium">How players pay</legend>
            {[
              ["online", "Online, in full", paymentReady ? "They get your payment QR when they register. Confirm once you see the payment." : "Add your payment QR or account number in Payments & alerts first."],
              ["venue", "At the venue", "Confirmed as soon as they register. Collect the payment at the door."],
            ].map(([value, label, hint]) => (
              <label key={value} className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="payment"
                  value={value}
                  defaultChecked={(event?.payment ?? (paymentReady ? "online" : "venue")) === value}
                  disabled={value === "online" && !paymentReady}
                  className="mt-0.5 accent-emerald-700"
                />
                <span>
                  <span className="font-medium">{label}</span>
                  <span className="block text-black/50">{hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <p className="text-xs text-black/50">Players also pay the booking fee once per sign-up, on top of the price.</p>
        </Section>

        <Section title="Registration">
          <label className="block max-w-xs text-sm">
            <span className="font-medium">Close registration this many hours before it starts</span>
            <input name="closeHoursBefore" type="number" min={0} max={168} defaultValue={event?.closeHoursBefore ?? 2} required className={inputClass} />
          </label>
        </Section>
      </div>

      <aside className="space-y-4">
        <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
          <p className="text-sm font-medium">Photo</p>
          <div className="mt-2 aspect-[4/3] overflow-hidden rounded-xl bg-black/5">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element -- local blob preview
              <img src={preview} alt="Event photo preview" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center px-6 text-center text-sm text-black/40">
                {processing ? "Preparing photo…" : "No photo. The card will use the activity's colour and icon."}
              </div>
            )}
          </div>
          <input
            ref={fileInput}
            name="photoPicker"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => pickPhoto(e.target.files?.[0])}
            className="mt-3 block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-50 file:px-3 file:py-2 file:font-medium file:text-emerald-800"
          />
          {preview && (
            <button type="button" onClick={clearPhoto} className="mt-2 text-sm text-red-700 hover:underline">
              Remove photo
            </button>
          )}
        </div>

        {isDraft ? (
          <>
            <button
              type="submit"
              name="intent"
              value="publish"
              disabled={saving || processing}
              className="w-full rounded-xl bg-emerald-700 px-6 py-3 font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Publish"}
            </button>
            <button
              type="submit"
              name="intent"
              value="draft"
              disabled={saving || processing}
              className="w-full rounded-xl border border-black/10 bg-white px-6 py-3 font-semibold hover:border-emerald-600 disabled:opacity-60"
            >
              Save draft
            </button>
            <p className="text-center text-xs text-black/50">Publishing holds the courts and opens registration on your page.</p>
          </>
        ) : (
          <button
            type="submit"
            name="intent"
            value="save"
            disabled={saving || processing}
            className="w-full rounded-xl bg-emerald-700 px-6 py-3 font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        )}
        <Link href={event ? `/app/events/hosted/${event.id}` : "/app/events"} className="block text-center text-sm text-black/60 hover:underline">
          Cancel
        </Link>
      </aside>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
      <h2 className="font-semibold">{title}</h2>
      {children}
    </section>
  );
}

const KIND_HINTS: Record<HostedEventKind, string> = {
  open_play: "Drop-in games, players rotate",
  workshop: "Learn or sharpen a skill, led by a coach",
  tournament: "Teams compete; captains register",
};

const TITLE_HINTS: Record<HostedEventKind, string> = {
  open_play: "e.g. Tuesday night open play",
  workshop: "e.g. Serve & return workshop with Coach Ana",
  tournament: "e.g. Holiday doubles cup",
};

const inputClass =
  "mt-1 w-full rounded-lg border border-black/15 bg-white px-3 py-2 outline-none read-only:bg-black/[0.03] focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 disabled:bg-black/[0.03]";
