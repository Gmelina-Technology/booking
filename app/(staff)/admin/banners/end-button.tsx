"use client";

import { useTransition } from "react";
import { toast } from "@/app/toaster";
import { useDialog } from "../../dialog";
import { endPageBanner } from "./actions";

export function EndBannerButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const { confirm } = useDialog();
  return (
    <button
      className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-30"
      disabled={pending}
      onClick={async () => {
        if (!(await confirm("Partners stop seeing it right away. It stays listed here.", { title: "End this banner?", confirmLabel: "End banner", danger: true })))
          return;
        start(async () => toast.result(await endPageBanner(id)));
      }}
    >
      End
    </button>
  );
}
