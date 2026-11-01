import { connection } from "next/server";
import { Suspense } from "react";
import { getAllActivities } from "@/lib/activities";
import { requireOwner } from "@/lib/auth";
import { paymentReady } from "@/lib/facility";
import { smtpConfigured } from "@/lib/mailer";
import { readSettings } from "@/lib/store";
import { facilityNow } from "@/lib/time";
import { Closures } from "./closures";
import SettingsForm from "./settings-form";
import { PageBanners } from "../page-banners";

export const metadata = { title: "Staff — payments & alerts" };

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <PageBanners />
      <h1 className="text-3xl font-bold tracking-tight">Payments &amp; alerts</h1>
      <p className="mt-1 text-black/60">
        What customers see in the downpayment email after you approve their booking.
      </p>
      <Suspense fallback={<div className="mt-8 h-96 animate-pulse rounded-2xl bg-black/5" />}>
        <Settings />
      </Suspense>
    </div>
  );
}

async function Settings() {
  await connection();
  const owner = await requireOwner();
  const [settings, activities] = await Promise.all([readSettings(owner.id), getAllActivities(owner.id)]);
  return (
    <>
      {!paymentReady(settings) && (
        <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>Customers can&apos;t request bookings yet</strong> for activities that need a downpayment. Add your payment QR code or account
          number below to start taking them.
        </p>
      )}
      <SettingsForm settings={settings} smtp={smtpConfigured()} />
      <div className="mt-6">
        <Closures closures={settings.closures} activities={activities.map((a) => ({ slug: a.slug, name: a.name }))} today={facilityNow().date} />
      </div>
    </>
  );
}
