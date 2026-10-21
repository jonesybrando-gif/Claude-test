"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select } from "@/components/ui/input";
import type { LabelInfo } from "@/components/label-badge";

export interface PickerClient {
  id: string;
  name: string;
  labelIds: string[];
}

/** Chooses the client the Performance page shows, optionally narrowed by label. Keeps the date range. */
export function ClientPicker({ clients, labels, current }: { clients: PickerClient[]; labels: LabelInfo[]; current: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [label, setLabel] = useState("");
  const shown = clients.filter((c) => !label || (label === "none" ? c.labelIds.length === 0 : c.labelIds.includes(label)));
  const go = (client: string) => {
    const next = new URLSearchParams(sp);
    if (client) next.set("client", client);
    else next.delete("client");
    router.push(`${pathname}?${next}`);
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      {labels.length > 0 && (
        <Select value={label} onChange={(e) => setLabel(e.target.value)} className="w-full sm:w-44" aria-label="Narrow clients by label">
          <option value="">All labels</option>
          {labels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          <option value="none">No label</option>
        </Select>
      )}
      <Select value={current ?? ""} onChange={(e) => go(e.target.value)} className="w-full sm:w-72" aria-label="Client">
        <option value="" disabled>Choose a client…</option>
        {shown.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        {current && !shown.some((c) => c.id === current) && current !== "all" && <option value={current}>{clients.find((c) => c.id === current)?.name ?? "Selected client"}</option>}
        <option value="all">All clients combined</option>
      </Select>
    </div>
  );
}
