"use client";

import { useMemo, useState, useTransition } from "react";
import { applyTemplateAction } from "@/server/dashboards/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Copies an agency template to the selected clients as new dashboards. */
export function ApplyTemplateForm({ templateId, clients }: { templateId: string; clients: { id: string; name: string; dashboards: number }[] }) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const shown = useMemo(() => clients.filter((c) => c.name.toLowerCase().includes(q.trim().toLowerCase())), [clients, q]);
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allShown = shown.length > 0 && shown.every((c) => picked.has(c.id));
  const apply = () =>
    start(async () => {
      setMsg(null);
      try {
        const r = await applyTemplateAction(templateId, [...picked]);
        if (!r.ok) return setMsg({ ok: false, text: r.error });
        setMsg({ ok: true, text: `Added to ${r.count} client${r.count === 1 ? "" : "s"}. Each got its own copy to adjust.` });
        setPicked(new Set());
      } catch {
        setMsg({ ok: false, text: "That didn't work. Check your connection and try again." });
      }
    });
  if (clients.length === 0) return <p className="text-sm text-text-3">No clients yet.</p>;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="Search clients" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" aria-label="Search clients" />
        <Button type="button" variant="ghost" size="sm" onClick={() => setPicked((p) => { const n = new Set(p); shown.forEach((c) => (allShown ? n.delete(c.id) : n.add(c.id))); return n; })}>
          {allShown ? "Clear shown" : "Select shown"}
        </Button>
      </div>
      <ul className="grid max-h-72 gap-1 overflow-y-auto rounded-lg border border-border p-2 sm:grid-cols-2">
        {shown.map((c) => (
          <li key={c.id}>
            <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-surface-2">
              <input type="checkbox" checked={picked.has(c.id)} onChange={() => toggle(c.id)} />
              <span className="min-w-0 flex-1 truncate">{c.name}</span>
              {c.dashboards > 0 && <span className="shrink-0 text-xs text-text-3">{c.dashboards} dashboard{c.dashboards === 1 ? "" : "s"}</span>}
            </label>
          </li>
        ))}
        {shown.length === 0 && <li className="px-2 py-1.5 text-sm text-text-3">No clients match.</li>}
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={apply} disabled={pending || picked.size === 0}>{pending ? "Applying…" : `Apply to ${picked.size || ""} client${picked.size === 1 ? "" : "s"}`.replace("  ", " ")}</Button>
        {msg && <p className={msg.ok ? "text-sm text-good-ink" : "text-sm text-critical-ink"} role={msg.ok ? "status" : "alert"}>{msg.text}</p>}
      </div>
      <p className="text-xs text-text-3">Each client gets a new, client-visible dashboard copied from this template. Later edits to the template don&apos;t change copies already made.</p>
    </div>
  );
}
