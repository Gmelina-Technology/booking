"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import type { PastEvent } from "@/lib/facility";
import { resizeImage } from "@/lib/resize-image";
import { saveEvent } from "./actions";

export default function EventForm({
  event,
  activities,
  today,
}: {
  event?: PastEvent;
  activities: { slug: string; name: string }[];
  today: string;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(event?.photo ? `/uploads/${event.photo}` : null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const [processing, setProcessing] = useState(false);

  // Release the object URL created for a newly picked photo.
  useEffect(() => {
    if (!preview?.startsWith("blob:")) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    setError(null);
    setProcessing(true);
    try {
      const resized = await resizeImage(file);
      setPhoto(resized);
      setPreview(URL.createObjectURL(resized));
      setRemovePhoto(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that photo.");
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

  function submit(form: FormData) {
    form.delete("photoPicker");
    if (photo) form.set("photo", photo);
    if (removePhoto) form.set("removePhoto", "1");
    setError(null);
    startSaving(async () => {
      const result = await saveEvent(event?.id ?? null, form);
      if (result.ok) router.push("/app/events");
      else setError(result.error);
    });
  }

  return (
    <form action={submit} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="min-w-0 space-y-4 rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
        <label className="block text-sm">
          <span className="font-medium">Event name</span>
          <input name="title" defaultValue={event?.title} required placeholder="e.g. Summer Pickleball Open" className={inputClass} />
        </label>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block text-sm">
            <span className="font-medium">Date</span>
            <input name="date" type="date" max={today} defaultValue={event?.date} required className={inputClass} />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Activity</span>
            <select name="activitySlug" defaultValue={event?.activitySlug ?? activities[0]?.slug} className={inputClass}>
              {activities.map((a) => (
                <option key={a.slug} value={a.slug}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium">Players / guests</span>
            <input name="participants" type="number" min={0} defaultValue={event?.participants ?? 0} className={inputClass} />
          </label>
        </div>
        <label className="block text-sm">
          <span className="font-medium">Short write-up</span>
          <textarea
            name="summary"
            rows={3}
            maxLength={300}
            defaultValue={event?.summary}
            placeholder="One or two sentences: who came, what happened, why it was fun."
            className={inputClass}
          />
        </label>
      </section>

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

        <label className="flex items-start gap-3 rounded-2xl border border-black/5 bg-white p-4 text-sm shadow-sm">
          <input
            type="checkbox"
            name="published"
            defaultChecked={event?.published ?? true}
            className="mt-0.5 h-4 w-4 accent-emerald-700"
          />
          <span>
            <span className="font-medium">Show on home page</span>
            <span className="block text-black/50">Untick to keep it as a draft.</span>
          </span>
        </label>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <button
          type="submit"
          disabled={saving || processing}
          className="w-full rounded-xl bg-emerald-700 px-6 py-3 font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
        >
          {saving ? "Saving…" : event ? "Save changes" : "Add event"}
        </button>
        <Link href="/app/events" className="block text-center text-sm text-black/60 hover:underline">
          Cancel
        </Link>
      </aside>
    </form>
  );
}

const inputClass =
  "mt-1 w-full rounded-lg border border-black/15 bg-white px-3 py-2 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20";
