import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { isPlatformAdmin, requireOwner } from "@/lib/auth";

export const metadata = { title: "Platform admin" };

/**
 * The platform area's entry: platform admins go to its first page. Partners
 * land here from bookmarks and emails made before the dashboard moved to
 * /app (including old /admin?view=… links), so they're sent there, query and all.
 */
export default function PlatformAdminPage({ searchParams }: PageProps<"/admin">) {
  return (
    <Suspense>
      <Entry searchParams={searchParams} />
    </Suspense>
  );
}

async function Entry({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  await connection();
  const owner = await requireOwner();

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) for (const v of [value ?? []].flat()) query.append(key, v);
  if (isPlatformAdmin(owner) && !query.size) redirect("/admin/fees");
  return redirect(query.size ? `/app?${query}` : "/app");
}
