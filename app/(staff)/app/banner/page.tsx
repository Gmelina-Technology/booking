import { connection } from "next/server";
import { Suspense } from "react";
import { getActiveActivities } from "@/lib/activities";
import { requireOwner } from "@/lib/auth";
import { getHeroData } from "@/lib/banner";
import { normalizeHeroSettings } from "@/lib/hero";
import { ownerPath } from "@/lib/owners";
import { readHero } from "@/lib/store";
import BannerEditor from "./banner-editor";

export const metadata = { title: "Staff — page design" };

export default function BannerPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Page design</h1>
      <p className="mt-1 text-black/60">The first thing customers see on your booking page. Pick a template, then make it yours.</p>
      <Suspense fallback={<div className="mt-8 h-[36rem] animate-pulse rounded-2xl bg-black/5" />}>
        <Banner />
      </Suspense>
    </div>
  );
}

async function Banner() {
  await connection();
  const owner = await requireOwner();
  const [doc, activities] = await Promise.all([readHero(owner.id), getActiveActivities(owner.id)]);
  const data = await getHeroData({ id: owner.id, handle: owner.handle, profile: owner.profile }, activities);
  return (
    <BannerEditor
      initial={normalizeHeroSettings(doc.settings, doc.library)}
      library={doc.library}
      data={data}
      pagePath={ownerPath(owner.handle)}
    />
  );
}
