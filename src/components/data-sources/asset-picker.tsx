"use client";

import { Fragment, useActionState } from "react";
import { linkDataAssets } from "@/app/(app)/integrations/data-sources/actions";
import { useFormSubmit } from "@/components/use-form-submit";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

// Shared "link assets to clients" picker for every non-ad data source
// (Google, CallRail, Facebook/Instagram organic, …). Assets are grouped by
// kind, then by their `group` (e.g. GA4 account).

export interface PickerAsset {
  kind: string;
  externalId: string;
  name: string;
  group?: string | null;
  /** Secondary text, e.g. the ID or URL. */
  detail?: string | null;
  timezone?: string | null;
  /** Client the asset is linked to now ("" = not monitored). */
  linkedClientId: string;
  /** e.g. "No longer accessible with this login". */
  note?: string | null;
}

export function AssetPicker({ connectionId, clients, assets, kindLabels }: { connectionId: string; clients: { id: string; name: string }[]; assets: PickerAsset[]; kindLabels: Record<string, string> }) {
  const [state, action, pending] = useActionState(linkDataAssets.bind(null, connectionId), undefined);
  const form = useFormSubmit(action);
  const kinds = [...new Set(assets.map((a) => a.kind))];

  return (
    <form {...form}>
      {kinds.map((kind) => {
        const ofKind = assets.filter((a) => a.kind === kind);
        const groups = [...new Set(ofKind.map((a) => a.group ?? ""))];
        return (
          <section key={kind} aria-label={kindLabels[kind] ?? kind} className="border-t border-border first:border-t-0">
            <h3 className="px-5 pt-4 pb-1 text-sm font-semibold">{kindLabels[kind] ?? kind} <span className="font-normal text-text-3">({ofKind.length})</span></h3>
            <Table>
              <THead>
                <tr>
                  <TH className="pl-5">Name</TH><TH>ID</TH><TH>Time zone</TH><TH className="pr-5">Client</TH>
                </tr>
              </THead>
              <TBody>
                {groups.map((g) => (
                  <Fragment key={g || "_"}>
                    {groups.length > 1 || g ? (
                      <tr><td colSpan={4} className="bg-surface-2 px-5 py-1.5 text-xs font-medium text-text-2">{g || "Other"}</td></tr>
                    ) : null}
                    {ofKind.filter((a) => (a.group ?? "") === g).map((a) => (
                      <TR key={a.externalId}>
                        <TD className="pl-5 font-medium whitespace-normal">
                          {a.name}
                          {a.note && <div className="text-xs font-normal text-warning-ink">{a.note}</div>}
                        </TD>
                        <TD className="text-text-2 whitespace-normal break-all">{a.detail ?? a.externalId}</TD>
                        <TD className="text-text-2">{a.timezone || "Client's"}</TD>
                        <TD className="pr-5">
                          <Select name={`client:${a.kind}:${a.externalId}`} defaultValue={a.linkedClientId} aria-label={`Client for ${a.name}`} className="w-52">
                            <option value="">Don&apos;t monitor</option>
                            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </Select>
                        </TD>
                      </TR>
                    ))}
                  </Fragment>
                ))}
              </TBody>
            </Table>
          </section>
        );
      })}
      {assets.length === 0 && <p className="px-5 py-8 text-center text-sm text-text-3">This login has no properties, sites or locations to link.</p>}
      <div className="flex flex-wrap items-center gap-3 border-t border-border px-5 py-4">
        <Button type="submit" disabled={pending || assets.length === 0}>{pending ? "Saving…" : "Save links"}</Button>
        {state?.ok && <p className="text-sm text-good-ink" role="status">{state.ok}</p>}
        {state?.errors?.map((e) => <p key={e} className="text-sm text-critical-ink" role="alert">{e}</p>)}
      </div>
    </form>
  );
}
