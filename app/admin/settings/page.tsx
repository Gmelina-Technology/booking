import { connection } from "next/server";
import { Suspense } from "react";
import { requireStaff } from "@/lib/auth";
import { smtpConfigured } from "@/lib/mailer";
import { readSettings } from "@/lib/store";
import SettingsForm from "./settings-form";

export const metadata = { title: "Staff — settings" };

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Payment &amp; email settings</h1>
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
  await requireStaff();
  return <SettingsForm settings={await readSettings()} smtp={smtpConfigured()} />;
}
