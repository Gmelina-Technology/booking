"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, useState, useTransition, type ReactNode } from "react";
import HeroView, { type HeroData } from "@/app/p/[handle]/hero-view";
import {
  accentSwatches,
  backgroundSwatches,
  defaultHeroSettings,
  MAX_HERO_IMAGES,
  MAX_LIBRARY_IMAGES,
  templates,
  type HeroAlignX,
  type HeroAlignY,
  type HeroSettings,
  type HeroTemplate,
} from "@/lib/hero";
import { resizeImage } from "@/lib/resize-image";
import { useDialog } from "../dialog";
import { deleteBannerPhoto, saveBanner, uploadBannerPhoto } from "./actions";

export default function BannerEditor({
  initial,
  library: initialLibrary,
  data,
  pagePath,
}: {
  initial: HeroSettings;
  library: string[];
  data: HeroData;
  pagePath: string;
}) {
  const [s, setS] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [library, setLibrary] = useState(initialLibrary);
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [saving, startSaving] = useTransition();
  const [uploading, setUploading] = useState(false);
  const { confirm } = useDialog();
  const fileInput = useRef<HTMLInputElement>(null);

  const dirty = JSON.stringify(s) !== JSON.stringify(saved);
  const template = templates.find((t) => t.id === s.template)!;
  const set = (patch: Partial<HeroSettings>) => {
    setResult(null);
    setS((prev) => ({ ...prev, ...patch }));
  };

  function pickTemplate(id: HeroTemplate) {
    const { positions } = templates.find((t) => t.id === id)!;
    // Keep the current position where the new layout allows it.
    set({
      template: id,
      alignX: positions.x.includes(s.alignX) ? s.alignX : positions.x[0],
      alignY: positions.y.includes(s.alignY) ? s.alignY : positions.y.includes("center") ? "center" : positions.y[0],
    });
  }

  function toggleImage(name: string) {
    if (s.images.includes(name)) set({ images: s.images.filter((n) => n !== name) });
    else if (s.images.length < MAX_HERO_IMAGES) set({ images: [...s.images, name] });
  }

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setResult(null);
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.set("photo", await resizeImage(file, { maxEdge: 2000 }));
        const r = await uploadBannerPhoto(form);
        if (!r.ok) {
          setResult({ ok: false, message: r.error });
          break;
        }
        setLibrary((l) => [...l, r.name]);
        // New photos go straight into the banner while there's room.
        setS((prev) => (prev.images.length < MAX_HERO_IMAGES ? { ...prev, images: [...prev.images, r.name] } : prev));
      }
    } catch (e) {
      setResult({ ok: false, message: e instanceof Error ? e.message : "Couldn't upload that photo." });
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function remove(name: string) {
    if (!(await confirm("It's removed from your banner too.", { title: "Delete this photo?", confirmLabel: "Delete", danger: true }))) return;
    await deleteBannerPhoto(name);
    setLibrary((l) => l.filter((n) => n !== name));
    setS((prev) => ({ ...prev, images: prev.images.filter((n) => n !== name) }));
    setSaved((prev) => ({ ...prev, images: prev.images.filter((n) => n !== name) }));
  }

  function save() {
    setResult(null);
    startSaving(async () => {
      const r = await saveBanner(s);
      setResult(r);
      if (r.ok) setSaved(s);
    });
  }

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
      {/* Controls */}
      <div className="space-y-4 lg:order-1">
        <Panel title="Template">
          <div className="grid grid-cols-2 gap-2">
            {templates.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => pickTemplate(t.id)}
                aria-pressed={s.template === t.id}
                className={`rounded-xl border p-2 text-left text-sm transition ${
                  s.template === t.id ? "border-emerald-600 bg-emerald-50 ring-2 ring-emerald-600/20" : "border-black/10 hover:border-black/25"
                }`}
              >
                <TemplateThumb id={t.id} />
                <span className="mt-2 block font-semibold">{t.name}</span>
                <span className="block text-xs text-black/50">{t.description}</span>
              </button>
            ))}
          </div>
        </Panel>

        <Panel title="Text position">
          <div className="flex items-start gap-4">
            <div className="grid shrink-0 grid-cols-3 gap-1 rounded-xl bg-black/5 p-1.5" role="group" aria-label="Text position">
              {(["top", "center", "bottom"] as HeroAlignY[]).map((y) =>
                (["left", "center", "right"] as HeroAlignX[]).map((x) => {
                  const allowed = template.positions.x.includes(x) && template.positions.y.includes(y);
                  const active = s.alignX === x && s.alignY === y;
                  return (
                    <button
                      key={`${x}-${y}`}
                      type="button"
                      disabled={!allowed}
                      onClick={() => set({ alignX: x, alignY: y })}
                      aria-label={`${y} ${x}`}
                      aria-pressed={active}
                      className={`grid h-9 w-11 place-items-center rounded-md transition ${
                        active ? "bg-emerald-700" : allowed ? "bg-white hover:bg-emerald-100" : "cursor-not-allowed bg-transparent"
                      }`}
                    >
                      <span className={`h-1.5 w-5 rounded-full ${active ? "bg-white" : allowed ? "bg-black/40" : "bg-black/10"}`} />
                    </button>
                  );
                }),
              )}
            </div>
            <p className="text-xs text-black/50">
              {s.template === "spotlight"
                ? "Place the text anywhere over the photo."
                : s.template === "split"
                  ? "Left or right swaps the text and photo. Up and down moves the text in its panel."
                  : s.template === "collage"
                    ? "Left or right puts the photos on the other side. Centre stacks them under the text."
                    : "Align the text to the left or centre."}
            </p>
          </div>
        </Panel>

        <Panel title="Text">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={s.showEyebrow} onChange={(e) => set({ showEyebrow: e.target.checked })} className="h-4 w-4 accent-emerald-700" />
            Show the small label above the headline
          </label>
          {s.showEyebrow && (
            <Field label="Label" value={s.eyebrow} max={60} placeholder={`${data.sports} sports · ${data.courts} courts & tables`} onChange={(v) => set({ eyebrow: v })} />
          )}
          <Field
            label="Headline"
            hint="Write {name} where your business name goes. It's shown in your highlight colour."
            value={s.headline}
            max={100}
            placeholder="Book your game at {name}"
            onChange={(v) => set({ headline: v })}
          />
          <Field
            label="Description"
            value={s.subheadline}
            max={240}
            multiline
            placeholder="Pick a sport, choose a court and time, and you're in."
            onChange={(v) => set({ subheadline: v })}
          />
        </Panel>

        {template.photos > 0 && (
          <Panel title="Photos">
            <p className="text-xs text-black/50">
              {s.images.length
                ? `This template shows ${
                    template.photos === 1 ? "the first photo" : `${template.photos} photos, topped up with event and stock photos`
                  }. Click to add or remove; numbers set the order.`
                : "None picked, so the banner uses your event photos (from Events) and stock photos. Upload your own to replace them."}
            </p>
            <div className="grid grid-cols-4 gap-2">
              {library.map((name) => {
                const order = s.images.indexOf(name);
                return (
                  <div key={name} className="group relative aspect-square">
                    <button
                      type="button"
                      onClick={() => toggleImage(name)}
                      aria-pressed={order !== -1}
                      aria-label={order !== -1 ? `Photo ${order + 1}, click to remove from banner` : "Add photo to banner"}
                      className={`h-full w-full overflow-hidden rounded-lg ring-2 transition ${
                        order !== -1 ? "ring-emerald-600" : "opacity-60 ring-transparent hover:opacity-100"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- small thumbnail of an upload */}
                      <img src={`/uploads/${name}`} alt="" className="h-full w-full object-cover" />
                    </button>
                    {order !== -1 && (
                      <span className="pointer-events-none absolute top-1 left-1 grid h-5 w-5 place-items-center rounded-full bg-emerald-700 text-xs font-bold text-white">
                        {order + 1}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => remove(name)}
                      aria-label="Delete photo"
                      className="absolute top-1 right-1 hidden h-5 w-5 place-items-center rounded-full bg-black/70 text-xs text-white group-hover:grid group-focus-within:grid"
                    >
                      ×
                    </button>
                  </div>
                );
              })}
              {library.length < MAX_LIBRARY_IMAGES && (
                <label className="grid aspect-square cursor-pointer place-items-center rounded-lg border-2 border-dashed border-black/15 text-center text-xs text-black/50 hover:border-emerald-600 hover:text-emerald-700">
                  {uploading ? "Uploading…" : "+ Upload"}
                  <input
                    ref={fileInput}
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/webp"
                    disabled={uploading}
                    onChange={(e) => upload(e.target.files)}
                    className="sr-only"
                  />
                </label>
              )}
            </div>
            <Segmented
              label="Keep in view when cropped"
              value={s.imageFocus}
              options={[
                ["top", "Top"],
                ["center", "Middle"],
                ["bottom", "Bottom"],
              ]}
              onChange={(v) => set({ imageFocus: v })}
            />
          </Panel>
        )}

        <Panel title="Colours">
          <ColorPicker label="Background" value={s.background} swatches={backgroundSwatches} onChange={(v) => set({ background: v })} />
          <ColorPicker label="Highlight & main button" value={s.accent} swatches={accentSwatches} onChange={(v) => set({ accent: v })} />
          {template.photos > 0 && (
            <label className="block text-sm">
              <span className="flex justify-between font-medium">
                Photo tint <span className="font-normal text-black/50">{s.overlay}%</span>
              </span>
              <input
                type="range"
                min={0}
                max={90}
                step={5}
                value={s.overlay}
                onChange={(e) => set({ overlay: Number(e.target.value) })}
                className="mt-1 w-full accent-emerald-700"
              />
            </label>
          )}
        </Panel>

        <Panel title="Buttons">
          <Segmented
            label="Style"
            value={s.buttonVariant}
            options={[
              ["solid", "Solid"],
              ["outline", "Outline"],
              ["soft", "Soft"],
            ]}
            onChange={(v) => set({ buttonVariant: v })}
          />
          <Segmented
            label="Corners"
            value={s.buttonShape}
            options={[
              ["square", "Square"],
              ["rounded", "Rounded"],
              ["pill", "Pill"],
            ]}
            onChange={(v) => set({ buttonShape: v })}
          />
          <Segmented
            label="Size"
            value={s.buttonSize}
            options={[
              ["md", "Medium"],
              ["lg", "Large"],
            ]}
            onChange={(v) => set({ buttonSize: v })}
          />
          <div className="grid grid-cols-2 gap-2">
            <Field
              label="Main button"
              value={s.primary.label}
              max={40}
              placeholder={defaultLabel(s.primary.target, data)}
              onChange={(v) => set({ primary: { ...s.primary, label: v } })}
            />
            <TargetSelect value={s.primary.target} data={data} onChange={(v) => set({ primary: { ...s.primary, target: v } })} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={s.secondary.show}
              onChange={(e) => set({ secondary: { ...s.secondary, show: e.target.checked } })}
              className="h-4 w-4 accent-emerald-700"
            />
            Show a second button
          </label>
          {s.secondary.show && (
            <div className="grid grid-cols-2 gap-2">
              <Field
                label="Second button"
                value={s.secondary.label}
                max={40}
                placeholder={defaultLabel(s.secondary.target, data)}
                onChange={(v) => set({ secondary: { ...s.secondary, label: v } })}
              />
              <TargetSelect value={s.secondary.target} data={data} onChange={(v) => set({ secondary: { ...s.secondary, target: v } })} />
            </div>
          )}
        </Panel>
      </div>

      {/* Preview and save bar */}
      <div className="min-w-0 lg:order-2">
        <div className="space-y-3 lg:sticky lg:top-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex rounded-lg bg-black/5 p-1 text-sm" role="group" aria-label="Preview size">
              {(["desktop", "phone"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDevice(d)}
                  aria-pressed={device === d}
                  className={`rounded-md px-3 py-1 capitalize ${device === d ? "bg-white font-medium shadow-sm" : "text-black/60"}`}
                >
                  {d}
                </button>
              ))}
            </div>
            <Link href={pagePath} target="_blank" className="text-sm font-semibold text-emerald-700 hover:underline">
              Open page ↗
            </Link>
            <div className="ml-auto flex items-center gap-3">
              {result && (
                <p role="status" className={`text-sm ${result.ok ? "text-emerald-700" : "text-red-700"}`}>
                  {result.message}
                </p>
              )}
              {!result && dirty && <p className="text-sm text-black/50">Unsaved changes</p>}
              <button
                type="button"
                onClick={() => set({ ...defaultHeroSettings, images: s.images })}
                className="rounded-xl px-3 py-2 text-sm text-black/60 hover:bg-black/5"
              >
                Reset to default
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving || uploading || !dirty}
                className="rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save banner"}
              </button>
            </div>
          </div>
          <ScaledPreview width={device === "desktop" ? 1280 : 390}>
            <HeroView settings={s} data={data} />
          </ScaledPreview>
          <p className="text-xs text-black/50">Preview only: links don&apos;t open here.</p>
        </div>
      </div>
    </div>
  );
}

/** Renders `children` at `width` CSS pixels, scaled down to fit the column. */
function ScaledPreview({ width, children }: { width: number; children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ scale: 1, height: 0 });

  useLayoutEffect(() => {
    const measure = () => {
      if (!outer.current || !inner.current) return;
      const scale = Math.min(1, outer.current.clientWidth / width);
      setBox({ scale, height: inner.current.offsetHeight * scale });
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (outer.current) observer.observe(outer.current);
    if (inner.current) observer.observe(inner.current);
    return () => observer.disconnect();
  }, [width]);

  return (
    <div ref={outer} className="overflow-hidden rounded-2xl border border-black/10 bg-black/5 shadow-sm">
      <div style={{ height: box.height || undefined }} className="flex items-start justify-center">
        <div
          ref={inner}
          style={{ width, transform: `scale(${box.scale})`, transformOrigin: "top center" }}
          className="shrink-0"
          onClickCapture={(e) => {
            if ((e.target as HTMLElement).closest("a")) e.preventDefault();
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function defaultLabel(target: string, data: HeroData) {
  if (target === "activities") return "See all activities";
  const a = data.activities.find((x) => x.slug === target) ?? data.activities[0];
  return a ? `Book ${a.name.toLowerCase()}` : "See all activities";
}

function TargetSelect({ value, data, onChange }: { value: string; data: HeroData; onChange: (v: string) => void }) {
  return (
    <label className="block text-sm">
      <span className="font-medium">Goes to</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
        <option value="featured">First activity{data.activities[0] ? ` (${data.activities[0].name})` : ""}</option>
        <option value="activities">Activity list</option>
        {data.activities.map((a) => (
          <option key={a.slug} value={a.slug}>
            Book {a.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
      <h2 className="font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Field({
  label,
  hint,
  value,
  max,
  placeholder,
  multiline,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  max: number;
  placeholder?: string;
  multiline?: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block text-sm">
      <span className="font-medium">{label}</span>
      {multiline ? (
        <textarea rows={3} value={value} maxLength={max} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={inputClass} />
      ) : (
        <input value={value} maxLength={max} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={inputClass} />
      )}
      {hint && <span className="mt-1 block text-xs text-black/50">{hint}</span>}
    </label>
  );
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
}) {
  return (
    <div className="text-sm">
      <p className="font-medium">{label}</p>
      <div className="mt-1 flex rounded-lg bg-black/5 p-1" role="group" aria-label={label}>
        {options.map(([v, text]) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            aria-pressed={value === v}
            className={`flex-1 rounded-md px-2 py-1 ${value === v ? "bg-white font-medium shadow-sm" : "text-black/60 hover:text-black"}`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

function ColorPicker({
  label,
  value,
  swatches,
  onChange,
}: {
  label: string;
  value: string;
  swatches: string[];
  onChange: (v: string) => void;
}) {
  // Typed hex values only apply once they're complete.
  const [draft, setDraft] = useState(value);
  const [shown, setShown] = useState(value);
  if (shown !== value) {
    setShown(value);
    setDraft(value);
  }
  return (
    <div className="text-sm">
      <p className="font-medium">{label}</p>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        {swatches.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            aria-label={c}
            aria-pressed={value === c}
            className={`h-7 w-7 rounded-full ring-1 ring-black/15 ${value === c ? "outline-2 outline-offset-2 outline-emerald-600" : ""}`}
            style={{ backgroundColor: c }}
          />
        ))}
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={`Custom ${label.toLowerCase()} colour`}
          className="h-7 w-9 cursor-pointer rounded border border-black/15 bg-white p-0.5"
        />
        <input
          value={draft}
          maxLength={7}
          onChange={(e) => {
            setDraft(e.target.value);
            if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) onChange(e.target.value.toLowerCase());
          }}
          aria-label={`${label} hex code`}
          className="w-20 rounded-md border border-black/15 px-2 py-1 font-mono text-xs"
        />
      </div>
    </div>
  );
}

/** Tiny wireframe of each template for the picker. */
function TemplateThumb({ id }: { id: HeroTemplate }) {
  const bar = "rounded-full bg-white/70";
  return (
    <div className="relative flex aspect-[16/9] overflow-hidden rounded-lg bg-emerald-950 p-2">
      {id === "collage" && (
        <>
          <div className="flex w-1/2 flex-col justify-center gap-1">
            <span className={`h-1.5 w-4/5 ${bar}`} />
            <span className={`h-1.5 w-3/5 ${bar}`} />
            <span className="mt-1 h-2 w-8 rounded bg-lime-300" />
          </div>
          <div className="grid w-1/2 grid-cols-2 gap-1">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className={`rounded bg-white/25 ${i % 2 ? "translate-y-1" : ""}`} />
            ))}
          </div>
        </>
      )}
      {id === "spotlight" && (
        <>
          <span className="absolute inset-0 bg-gradient-to-br from-sky-700/70 to-emerald-800/60" />
          <div className="relative flex w-full flex-col items-center justify-center gap-1">
            <span className={`h-1.5 w-3/5 ${bar}`} />
            <span className={`h-1.5 w-2/5 ${bar}`} />
            <span className="mt-1 h-2 w-8 rounded bg-lime-300" />
          </div>
        </>
      )}
      {id === "split" && (
        <>
          <div className="flex w-1/2 flex-col justify-center gap-1 pr-2">
            <span className={`h-1.5 w-4/5 ${bar}`} />
            <span className={`h-1.5 w-3/5 ${bar}`} />
            <span className="mt-1 h-2 w-8 rounded bg-lime-300" />
          </div>
          <span className="absolute inset-y-0 right-0 w-1/2 bg-gradient-to-br from-sky-700/80 to-emerald-700/70" />
        </>
      )}
      {id === "minimal" && (
        <div className="flex w-full flex-col justify-center gap-1">
          <span className={`h-2 w-4/5 ${bar}`} />
          <span className={`h-2 w-3/5 ${bar}`} />
          <div className="mt-1 flex gap-1">
            {[0, 1, 2].map((i) => (
              <span key={i} className="h-2.5 w-5 rounded bg-white/20" />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const inputClass =
  "mt-1 w-full rounded-lg border border-black/15 bg-white px-3 py-2 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20";
