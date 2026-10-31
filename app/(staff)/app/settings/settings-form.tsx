"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { PaymentSettings } from "@/lib/facility";
import { resizeImage } from "@/lib/resize-image";
import { saveSettings, sendTestEmail } from "./actions";

export default function SettingsForm({ settings, smtp }: { settings: PaymentSettings; smtp: boolean }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [qr, setQr] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(settings.qrPhoto ? `/uploads/${settings.qrPhoto}` : null);
  const [removeQr, setRemoveQr] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [saving, startSaving] = useTransition();
  const [testTo, setTestTo] = useState(settings.staffNotifyEmail);
  const [testResult, setTestResult] = useState<{ ok: boolean; detail: string } | null>(null);
  const [testing, startTesting] = useTransition();

  useEffect(() => {
    if (!preview?.startsWith("blob:")) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  async function pickQr(file: File | undefined) {
    if (!file) return;
    setResult(null);
    try {
      const resized = await resizeImage(file, { maxEdge: 1000, type: "image/png" });
      setQr(resized);
      setPreview(URL.createObjectURL(resized));
      setRemoveQr(false);
    } catch (e) {
      setResult({ ok: false, message: e instanceof Error ? e.message : "Couldn't read that image." });
    }
  }

  function submit(form: FormData) {
    form.delete("qrPicker");
    if (qr) form.set("qr", qr);
    if (removeQr) form.set("removeQr", "1");
    setResult(null);
    startSaving(async () => {
      const r = await saveSettings(form);
      setResult(r);
      if (r.ok) setQr(null);
    });
  }

  return (
    <div className="mt-8 space-y-6">
      <form action={submit} className="grid gap-6 md:grid-cols-[minmax(0,1fr)_260px]">
        <section className="min-w-0 space-y-4 rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
          <h2 className="font-semibold">Downpayment</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Downpayment (% of total)" name="downpaymentPercent" type="number" min={0} max={100} defaultValue={settings.downpaymentPercent} required />
            <Field label="Customer has (hours) to pay" name="paymentWindowHours" type="number" min={1} max={168} defaultValue={settings.paymentWindowHours} required />
            <Field label="You have (hours) to review a request" name="requestWindowHours" type="number" min={1} max={168} defaultValue={settings.requestWindowHours} required />
            <Field label="Payment method" name="methodName" defaultValue={settings.methodName} placeholder="GCash, Maya, InstaPay…" />
            <Field label="Account name" name="accountName" defaultValue={settings.accountName} placeholder="As shown in the app" />
            <Field label="Account / mobile number" name="accountNumber" defaultValue={settings.accountNumber} placeholder="0917 000 0000" />
          </div>
          <p className="text-xs text-black/50">
            If the customer hasn&apos;t entered a payment reference in time, the booking is cancelled automatically, the slot is freed and the
            customer is emailed. Requests you haven&apos;t approved or declined in time, or by their start time, are declined the same way.
            Bookings you add yourself are never declined automatically.
          </p>
          <label className="block text-sm">
            <span className="font-medium">Payment instructions</span>
            <textarea name="instructions" rows={3} maxLength={500} defaultValue={settings.instructions} className={inputClass} />
          </label>

          <h2 className="pt-2 font-semibold">Staff alerts</h2>
          <Field
            label="Email new booking requests to"
            name="staffNotifyEmail"
            type="email"
            defaultValue={settings.staffNotifyEmail}
            placeholder="frontdesk@yourfacility.com (leave empty to turn off)"
          />
        </section>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
            <p className="text-sm font-medium">Payment QR code</p>
            <p className="text-xs text-black/50">Your GCash/Maya &ldquo;Receive money&rdquo; QR. It goes in the email.</p>
            <div className="mt-2 aspect-square overflow-hidden rounded-xl border border-black/5 bg-black/[0.03]">
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element -- local preview
                <img src={preview} alt="Payment QR code" className="h-full w-full object-contain" />
              ) : (
                <div className="flex h-full items-center justify-center p-4 text-center text-sm text-black/40">No QR uploaded</div>
              )}
            </div>
            <input
              ref={fileInput}
              name="qrPicker"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => pickQr(e.target.files?.[0])}
              className="mt-3 block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-50 file:px-3 file:py-2 file:font-medium file:text-emerald-800"
            />
            {preview && (
              <button
                type="button"
                onClick={() => {
                  setQr(null);
                  setPreview(null);
                  setRemoveQr(true);
                  if (fileInput.current) fileInput.current.value = "";
                }}
                className="mt-2 text-sm text-red-700 hover:underline"
              >
                Remove QR
              </button>
            )}
          </div>
          {result && (
            <p className={`rounded-lg px-3 py-2 text-sm ${result.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>{result.message}</p>
          )}
          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-xl bg-emerald-700 px-6 py-3 font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save settings"}
          </button>
        </aside>
      </form>

      <section className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
        <h2 className="font-semibold">Email delivery</h2>
        <p className="mt-1 text-sm text-black/60">
          {smtp
            ? "SMTP is set up. Emails are sent for real."
            : "SMTP isn't set up yet, so emails are saved to data/outbox on the server instead of being sent. Set the SMTP_* environment variables (see .env.example)."}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            type="email"
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            placeholder="you@example.com"
            aria-label="Send test email to"
            className={`${inputClass} mt-0 max-w-xs`}
          />
          <button
            type="button"
            disabled={testing}
            onClick={() => startTesting(async () => setTestResult(await sendTestEmail(testTo)))}
            className="rounded-lg border border-black/10 bg-white px-4 py-2 text-sm font-medium hover:border-emerald-600 disabled:opacity-50"
          >
            {testing ? "Sending…" : "Send test email"}
          </button>
        </div>
        {testResult && <p className={`mt-2 text-sm ${testResult.ok ? "text-emerald-700" : "text-red-700"}`}>{testResult.detail}</p>}
      </section>
    </div>
  );
}

const inputClass =
  "mt-1 w-full rounded-lg border border-black/15 bg-white px-3 py-2 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20";

function Field({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block text-sm">
      <span className="font-medium">{label}</span>
      <input {...props} className={inputClass} />
    </label>
  );
}
