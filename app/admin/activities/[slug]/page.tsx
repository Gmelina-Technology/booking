import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getActivity } from "@/lib/activities";
import ActivityForm from "../activity-form";

export const metadata = { title: "Staff — edit activity" };

export default function EditActivityPage({ params }: PageProps<"/admin/activities/[slug]">) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <Link href="/admin/activities" className="text-sm text-black/60 hover:underline">
        ← Activities
      </Link>
      <Suspense fallback={<div className="mt-4 h-96 animate-pulse rounded-2xl bg-black/5" />}>
        <EditActivity params={params} />
      </Suspense>
    </div>
  );
}

async function EditActivity({ params }: { params: Promise<{ slug: string }> }) {
  const activity = await getActivity((await params).slug);
  if (!activity) notFound();
  return (
    <>
      <h1 className="mt-2 mb-6 text-3xl font-bold tracking-tight">Edit {activity.name}</h1>
      <ActivityForm key={activity.slug} activity={activity} />
    </>
  );
}
