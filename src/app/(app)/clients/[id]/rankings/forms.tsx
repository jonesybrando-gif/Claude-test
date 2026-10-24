"use client";

import { useActionState, useState } from "react";
import { addKeywords, saveRankProject } from "./actions";
import { useFormSubmit } from "@/components/use-form-submit";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { COMMON_LOCATIONS, DEVICE_OPTIONS, MAX_KEYWORDS_PER_CLIENT, parseKeywordList, type RankDeviceSetting } from "@/lib/rankings";

const KNOWN = new Set(COMMON_LOCATIONS.flatMap((g) => g.items.map((i) => i.code)));

function Status({ state }: { state: { ok?: string; errors?: string[] } | undefined }) {
  return (
    <>
      {state?.ok && <span className="text-xs text-good-ink" role="status">{state.ok}</span>}
      {state?.errors?.map((e) => <span key={e} className="text-xs text-critical-ink" role="alert">{e}</span>)}
    </>
  );
}

export function RankProjectForm({ clientId, domain, locationCode, device, isNew }: { clientId: string; domain?: string; locationCode: number; device: RankDeviceSetting; isNew: boolean }) {
  const [state, action, pending] = useActionState(saveRankProject.bind(null, clientId), undefined);
  const form = useFormSubmit(action);
  const [loc, setLoc] = useState(KNOWN.has(locationCode) ? String(locationCode) : "custom");
  return (
    <form {...form} className="flex flex-col gap-3">
      <div className="grid gap-3 md:grid-cols-[1.2fr_1fr_auto]">
        <div className="flex flex-col gap-1">
          <Label htmlFor="rank-domain">Website domain</Label>
          <Input id="rank-domain" name="domain" placeholder="example.com" defaultValue={domain} required />
          <span className="text-xs text-text-3">Matches www and any subdomain.</span>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="rank-location">Location</Label>
          <Select id="rank-location" name="location" value={loc} onChange={(e) => setLoc(e.target.value)}>
            {COMMON_LOCATIONS.map((g) => (
              <optgroup key={g.group} label={g.group}>
                {g.items.map((i) => <option key={i.code} value={i.code}>{i.name}</option>)}
              </optgroup>
            ))}
            <option value="custom">Other (enter a location code)…</option>
          </Select>
          {loc === "custom" && (
            <Input name="customLocation" type="number" inputMode="numeric" aria-label="DataForSEO location code" placeholder="e.g. 1014221" defaultValue={KNOWN.has(locationCode) ? "" : locationCode} required />
          )}
        </div>
        <fieldset className="flex flex-col gap-1">
          <legend className="text-xs font-medium text-text-2">Device</legend>
          <div className="flex flex-col gap-1 pt-1 text-sm">
            {DEVICE_OPTIONS.map((o) => (
              <label key={o.value} className="flex items-center gap-2">
                <input type="radio" name="device" value={o.value} defaultChecked={o.value === device} /> {o.label}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={pending}>{pending ? "Saving…" : isNew ? "Start tracking" : "Save settings"}</Button>
        <Status state={state} />
      </div>
    </form>
  );
}

export function AddKeywordsForm({ clientId, tracked }: { clientId: string; tracked: number }) {
  const [state, action, pending] = useActionState(addKeywords.bind(null, clientId), undefined);
  const form = useFormSubmit(action, state?.ok && state);
  const [count, setCount] = useState(0);
  const room = Math.max(0, MAX_KEYWORDS_PER_CLIENT - tracked);
  return (
    <form {...form} className="flex flex-col gap-2">
      <Label htmlFor="rank-keywords">Add keywords, one per line</Label>
      <textarea
        id="rank-keywords"
        name="keywords"
        rows={5}
        className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        placeholder={"dentist near me\nemergency dentist carlsbad"}
        onChange={(e) => setCount(parseKeywordList(e.target.value).length)}
        required
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={pending || room === 0}>{pending ? "Adding…" : count ? `Add ${count} keyword${count === 1 ? "" : "s"}` : "Add keywords"}</Button>
        <span className="text-xs text-text-3">{tracked} of {MAX_KEYWORDS_PER_CLIENT} used{count > room ? ` · only the first ${room} new keywords will be added` : ""}</span>
        <Status state={state} />
      </div>
    </form>
  );
}
