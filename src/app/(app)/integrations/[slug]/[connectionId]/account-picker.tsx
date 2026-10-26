"use client";

import { useActionState } from "react";
import { linkAccounts } from "../../actions";
import { useFormSubmit } from "@/components/use-form-submit";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

interface Row {
  externalId: string;
  display: string;
  name: string;
  currency: string;
  timezone: string;
  isTestAccount: boolean;
  statusNote: string | null;
}

export function AccountPicker({ connectionId, platforms, clients, accounts, linkedTo }: { connectionId: string; platforms: { key: string; label: string }[]; clients: { id: string; name: string }[]; accounts: Row[]; linkedTo: Record<string, string[]> }) {
  const [state, action, pending] = useActionState(linkAccounts.bind(null, connectionId), undefined);
  const form = useFormSubmit(action);
  const clientName = new Map(clients.map((c) => [c.id, c.name]));
  return (
    <form {...form}>
      <Table>
        <THead>
          <tr>
            <TH className="pl-5">Account</TH><TH>ID</TH><TH>Currency</TH><TH>Time zone</TH>
            {platforms.map((p, i) => <TH key={p.key} className={i === platforms.length - 1 ? "pr-5" : ""}>{platforms.length > 1 ? `${p.label} → client` : "Client"}</TH>)}
          </tr>
        </THead>
        <TBody>
          {accounts.map((a) => (
            <TR key={a.externalId}>
              <TD className="pl-5 font-medium whitespace-normal">
                {a.name} {a.isTestAccount && <Badge variant="info">Test account</Badge>}
                {a.statusNote && <div className="text-xs font-normal text-warning-ink">{a.statusNote}</div>}
              </TD>
              <TD className="text-text-2">{a.display}</TD>
              <TD className="text-text-2">{a.currency}</TD>
              <TD className="text-text-2">{a.timezone}</TD>
              {platforms.map((p, i) => (
                <TD key={p.key} className={i === platforms.length - 1 ? "pr-5" : ""}>
                  {(linkedTo[`${p.key}:${a.externalId}`]?.length ?? 0) > 1 ? (
                    // Shared by several clients: not on this form, so saving leaves it alone.
                    <div className="w-52 text-xs whitespace-normal text-text-2">
                      Shared by {linkedTo[`${p.key}:${a.externalId}`]!.map((id) => clientName.get(id) ?? "a client").join(", ")}. Manage it on each client&apos;s Ad accounts page.
                    </div>
                  ) : (
                    <Select name={`client:${p.key}:${a.externalId}`} defaultValue={linkedTo[`${p.key}:${a.externalId}`]?.[0] ?? ""} aria-label={`${p.label} client for ${a.name}`} className="w-52">
                      <option value="">Don&apos;t monitor</option>
                      {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </Select>
                  )}
                </TD>
              ))}
            </TR>
          ))}
          {accounts.length === 0 && (
            <tr><td colSpan={4 + platforms.length} className="px-5 py-8 text-center text-sm text-text-3">This login has no advertising accounts.</td></tr>
          )}
        </TBody>
      </Table>
      <div className="flex flex-wrap items-center gap-3 px-5 py-4">
        <Button type="submit" disabled={pending || accounts.length === 0}>{pending ? "Saving…" : "Save account links"}</Button>
        {state?.ok && <p className="text-sm text-good-ink" role="status">{state.ok}</p>}
        {state?.errors?.map((e) => <p key={e} className="text-sm text-critical-ink" role="alert">{e}</p>)}
      </div>
    </form>
  );
}
