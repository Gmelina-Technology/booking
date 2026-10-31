import Link from "next/link";
import ActivityForm from "../activity-form";

export const metadata = { title: "Staff — new activity" };

export default function NewActivityPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <Link href="/app/activities" className="text-sm text-black/60 hover:underline">
        ← Activities
      </Link>
      <h1 className="mt-2 mb-6 text-3xl font-bold tracking-tight">New activity</h1>
      <ActivityForm />
    </div>
  );
}
