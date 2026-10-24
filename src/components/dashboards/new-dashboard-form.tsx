"use client";

import { useActionState, useState } from "react";
import { Check, LayoutTemplate, Plus, Plug } from "lucide-react";
import type { CreateDashboardState } from "@/server/dashboards/actions";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { cn } from "@/components/ui/cn";

export interface TemplateOption {
  value: string;
  name: string;
  description: string;
  /** Source labels the template needs, with whether each is connected (client mode). */
  needs: { label: string; connected: boolean }[];
  group: "builtin" | "agency";
}

/** Pick blank or a template, optionally name it, then create. */
export function NewDashboardForm({ action, options, showVisibility, submitLabel = "Create dashboard" }: { action: (prev: CreateDashboardState, form: FormData) => Promise<CreateDashboardState>; options: TemplateOption[]; showVisibility: boolean; submitLabel?: string }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [choice, setChoice] = useState("blank");
  const [visible, setVisible] = useState(true);
  const card = (value: string, title: string, body: string, icon: React.ReactNode, needs: TemplateOption["needs"] = []) => (
    <label key={value} className={cn("relative flex cursor-pointer flex-col gap-1 rounded-xl border bg-surface px-4 py-3 hover:bg-surface-2", choice === value ? "border-brand ring-1 ring-brand" : "border-border")}>
      <input type="radio" name="template" value={value} checked={choice === value} onChange={() => setChoice(value)} className="sr-only" />
      <span className="flex items-center gap-2 text-sm font-semibold">{icon} {title}{choice === value && <Check className="ml-auto h-4 w-4 text-brand" aria-hidden />}</span>
      <span className="text-xs text-text-3">{body}</span>
      {needs.length > 0 && (
        <span className="mt-1 flex flex-wrap gap-1">
          {needs.map((n) => (
            <span key={n.label} className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px]", n.connected ? "bg-good-bg text-good-ink" : "bg-surface-2 text-text-2")}>
              {!n.connected && <Plug className="h-3 w-3" aria-hidden />}
              {n.connected ? n.label : `needs ${n.label}`}
            </span>
          ))}
        </span>
      )}
    </label>
  );
  const builtins = options.filter((o) => o.group === "builtin");
  const agency = options.filter((o) => o.group === "agency");
  return (
    <form action={formAction} className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold">Start from</legend>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {card("blank", "Blank dashboard", "Start empty and add widgets from the library.", <Plus className="h-4 w-4 text-text-2" aria-hidden />)}
          {builtins.map((o) => card(o.value, o.name, o.description, <LayoutTemplate className="h-4 w-4 text-text-2" aria-hidden />, o.needs))}
        </div>
        {agency.length > 0 && (
          <>
            <p className="mt-3 mb-1 text-xs font-medium uppercase tracking-wide text-text-3">Your agency&apos;s templates</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{agency.map((o) => card(o.value, o.name, o.description, <LayoutTemplate className="h-4 w-4 text-brand" aria-hidden />))}</div>
          </>
        )}
      </fieldset>
      <div className="flex max-w-sm flex-col gap-1.5">
        <Label htmlFor="new-dash-name">Name <span className="font-normal text-text-3">(optional)</span></Label>
        <Input id="new-dash-name" name="name" maxLength={80} placeholder={choice === "blank" ? "New dashboard" : options.find((o) => o.value === choice)?.name} />
      </div>
      {showVisibility && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} />
          Show to the client (client logins and shared report links)
          <input type="hidden" name="clientVisible" value={visible ? "on" : "off"} />
        </label>
      )}
      {state?.error && <p className="text-sm text-critical-ink" role="alert">{state.error}</p>}
      <div><Button type="submit" disabled={pending}>{pending ? "Creating…" : submitLabel}</Button></div>
    </form>
  );
}
