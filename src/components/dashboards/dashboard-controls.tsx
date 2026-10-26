"use client";

import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Copy, Eye, EyeOff, LayoutTemplate, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/components/ui/cn";
import { deleteDashboardAction, duplicateDashboardAction, renameDashboardAction, reorderDashboardsAction, saveAsTemplateAction, setDashboardVisibilityAction } from "@/server/dashboards/actions";

/** Whether the dashboard appears for client logins and on shared report links. */
export function DashboardVisibilityToggle({ id, visible }: { id: string; visible: boolean }) {
  const [pending, start] = useTransition();
  const [on, setOn] = useOptimistic(visible);
  const router = useRouter();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={`Dashboard: ${on ? "shown to the client" : "hidden from the client"}`}
      disabled={pending}
      onClick={() => start(async () => { setOn(!on); await setDashboardVisibilityAction(id, !on); router.refresh(); })}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium cursor-pointer disabled:opacity-60 ${on ? "border-transparent bg-good-bg text-good-ink" : "border-border bg-surface-2 text-text-2"}`}
    >
      <span className={`relative inline-block h-3.5 w-6 rounded-full transition-colors ${on ? "bg-good" : "bg-text-3/40"}`} aria-hidden>
        <span className={`absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white transition-all ${on ? "left-3" : "left-0.5"}`} />
      </span>
      {on ? <Eye className="h-3.5 w-3.5" aria-hidden /> : <EyeOff className="h-3.5 w-3.5" aria-hidden />}
      {on ? "Client sees this" : "Hidden from client"}
    </button>
  );
}

type Mode = null | "menu" | "rename" | "template" | "delete";

/**
 * "More" actions for a dashboard: rename, duplicate, move, save as template
 * (admins) and delete (confirmed inline, not with a browser dialog).
 */
export function DashboardMenu({ id, name, clientId, order, canTemplate, afterDeleteHref, viewHref }: { id: string; name: string; clientId: string | null; order: string[]; canTemplate: boolean; afterDeleteHref: string; /** Where a duplicate opens; "__ID__" is replaced by its id. */ viewHref: string }) {
  const [mode, setMode] = useState<Mode>(null);
  const [text, setText] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const idx = order.indexOf(id);

  useEffect(() => {
    if (!mode) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node) && !pending) setMode(null); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMode(null); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [mode, pending]);

  const run = (fn: () => Promise<{ ok: boolean; error?: string } | { ok: false; error: string }>, after?: (r: unknown) => void) =>
    start(async () => {
      setError(null);
      try {
        const r = await fn();
        if (!r.ok) return setError("error" in r && r.error ? r.error : "Something went wrong.");
        after?.(r);
      } catch {
        setError("That didn't work. Check your connection and try again.");
      }
    });

  const move = (dir: -1 | 1) => {
    if (!clientId) return;
    const next = [...order];
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    run(() => reorderDashboardsAction(clientId, next), () => { setMode(null); router.refresh(); });
  };

  const item = "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm ui-focus-ring text-text hover:bg-selected focus:bg-selected disabled:opacity-50 cursor-pointer";
  return (
    <div ref={ref} className="relative">
      <Button type="button" variant="outline" size="sm" aria-haspopup="menu" aria-expanded={mode === "menu"} onClick={() => { setMode(mode ? null : "menu"); setError(null); setText(name); }}>
        <MoreHorizontal className="h-4 w-4" aria-hidden /> More
      </Button>
      {note && <span role="status" className="absolute right-0 top-full mt-1 whitespace-nowrap text-xs text-good-ink">{note}</span>}
      {mode && (
        <div className="absolute right-0 z-30 mt-1 w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-surface p-1 shadow-lg">
          {mode === "menu" && (
            <div role="menu" aria-label="Dashboard actions">
              <button role="menuitem" type="button" className={item} onClick={() => setMode("rename")}><Pencil className="h-4 w-4 text-text-2" aria-hidden /> Rename</button>
              <button role="menuitem" type="button" className={item} disabled={pending} onClick={() => run(() => duplicateDashboardAction(id), (r) => { setMode(null); router.push(viewHref.replace("__ID__", (r as { id: string }).id)); router.refresh(); })}><Copy className="h-4 w-4 text-text-2" aria-hidden /> Duplicate</button>
              {clientId && order.length > 1 && (
                <>
                  <button role="menuitem" type="button" className={item} disabled={pending || idx <= 0} onClick={() => move(-1)}><ArrowLeft className="h-4 w-4 text-text-2" aria-hidden /> Move left</button>
                  <button role="menuitem" type="button" className={item} disabled={pending || idx >= order.length - 1} onClick={() => move(1)}><ArrowRight className="h-4 w-4 text-text-2" aria-hidden /> Move right</button>
                </>
              )}
              {canTemplate && clientId && <button role="menuitem" type="button" className={item} onClick={() => setMode("template")}><LayoutTemplate className="h-4 w-4 text-text-2" aria-hidden /> Save as agency template</button>}
              <div className="mt-1 border-t border-border pt-1">
                <button role="menuitem" type="button" className={cn(item, "text-critical-ink")} onClick={() => setMode("delete")}><Trash2 className="h-4 w-4" aria-hidden /> Delete…</button>
              </div>
            </div>
          )}
          {(mode === "rename" || mode === "template") && (
            <form
              className="flex flex-col gap-2 p-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (mode === "rename") run(() => renameDashboardAction(id, text), () => { setMode(null); router.refresh(); });
                else run(() => saveAsTemplateAction(id, text), () => { setMode(null); setNote("Saved to Settings → Dashboards"); setTimeout(() => setNote(null), 4000); });
              }}
            >
              <label className="text-xs font-medium text-text-2" htmlFor={`dash-name-${id}`}>{mode === "rename" ? "Dashboard name" : "Template name"}</label>
              <Input id={`dash-name-${id}`} value={text} maxLength={80} onChange={(e) => setText(e.target.value)} autoFocus />
              {mode === "template" && <p className="text-xs text-text-3">Copies this layout (not the data) into an agency template you can apply to other clients.</p>}
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={pending || !text.trim()}>{pending ? "Saving…" : mode === "rename" ? "Rename" : "Save template"}</Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setMode("menu")} disabled={pending}>Back</Button>
              </div>
            </form>
          )}
          {mode === "delete" && (
            <div className="flex flex-col gap-2 p-2" role="alertdialog" aria-label="Delete dashboard">
              <p className="text-sm">Delete <strong className="font-semibold">{name}</strong>?</p>
              <p className="text-xs text-text-3">Its layout is removed for everyone, including the client. Your data isn&apos;t affected. This can&apos;t be undone.</p>
              <div className="flex gap-2">
                <Button type="button" variant="destructive" size="sm" disabled={pending} autoFocus onClick={() => run(() => deleteDashboardAction(id), () => { setMode(null); router.push(afterDeleteHref); router.refresh(); })}>{pending ? "Deleting…" : "Delete dashboard"}</Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setMode(null)} disabled={pending}>Cancel</Button>
              </div>
            </div>
          )}
          {error && <p className="px-2 pb-2 text-xs text-critical-ink" role="alert">{error}</p>}
        </div>
      )}
    </div>
  );
}
