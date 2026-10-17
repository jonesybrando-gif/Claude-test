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
  linkedClientId: string;
}

export function AccountPicker({ connectionId, clients, accounts }: { connectionId: string; clients: { id: string; name: string }[]; accounts: Row[] }) {
  const [state, action, pending] = useActionState(linkAccounts.bind(null, connectionId), undefined);
  const form = useFormSubmit(action);
  return (
    <form {...form}>
      <Table>
        <THead>
          <tr><TH className="pl-5">Account</TH><TH>Customer ID</TH><TH>Currency</TH><TH>Time zone</TH><TH className="pr-5">Client</TH></tr>
        </THead>
        <TBody>
          {accounts.map((a) => (
            <TR key={a.externalId}>
              <TD className="pl-5 font-medium">
                {a.name} {a.isTestAccount && <Badge variant="info">Test account</Badge>}
              </TD>
              <TD className="text-text-2">{a.display}</TD>
              <TD className="text-text-2">{a.currency}</TD>
              <TD className="text-text-2">{a.timezone}</TD>
              <TD className="pr-5">
                <Select name={`client:${a.externalId}`} defaultValue={a.linkedClientId} aria-label={`Client for ${a.name}`} className="w-56">
                  <option value="">Don&apos;t monitor</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </TD>
            </TR>
          ))}
          {accounts.length === 0 && (
            <tr><td colSpan={5} className="px-5 py-8 text-center text-sm text-text-3">This Google login has no advertising accounts.</td></tr>
          )}
        </TBody>
      </Table>
      <div className="flex flex-wrap items-center gap-3 px-5 py-4">
        <Button type="submit" disabled={pending || accounts.length === 0}>{pending ? "Linking…" : "Save account links"}</Button>
        {state?.ok && <p className="text-sm text-good-ink" role="status">{state.ok}</p>}
        {state?.errors?.map((e) => <p key={e} className="text-sm text-critical-ink" role="alert">{e}</p>)}
      </div>
    </form>
  );
}
