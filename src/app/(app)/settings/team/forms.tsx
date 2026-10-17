"use client";

import { useActionState, useState, useTransition } from "react";
import { inviteUser, sendAccessLink, setUserActive, updateUser, type TeamState } from "./actions";
import { useFormSubmit } from "@/components/use-form-submit";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { ROLE_LABEL } from "@/lib/team-policy";
import type { Role } from "@/lib/access";

interface ClientOpt {
  id: string;
  name: string;
}

function Result({ state }: { state: TeamState }) {
  const [copied, setCopied] = useState(false);
  if (!state) return null;
  return (
    <div className="flex flex-col gap-1 text-sm" role="status">
      {state.ok && <p className="text-good-ink">{state.ok}</p>}
      {state.link && (
        <div className="flex flex-wrap items-center gap-2">
          <code className="max-w-full overflow-x-auto rounded bg-surface-2 px-2 py-1 text-xs ring-1 ring-border">{state.link}</code>
          <Button type="button" variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(state.link!).then(() => setCopied(true))}>
            {copied ? "Copied" : "Copy link"}
          </Button>
        </div>
      )}
      {state.errors?.map((e) => <p key={e} className="text-critical-ink" role="alert">{e}</p>)}
    </div>
  );
}

function RoleFields({ role, setRole, clients, clientId, assigned }: { role: Role; setRole: (r: Role) => void; clients: ClientOpt[]; clientId?: string | null; assigned?: string[] }) {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label>Role</Label>
        <Select name="role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
          {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </Select>
      </div>
      {role === "CLIENT_USER" && (
        <div className="flex flex-col gap-1.5">
          <Label>Client they can view</Label>
          <Select name="clientId" defaultValue={clientId ?? ""} required>
            <option value="" disabled>Choose…</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>
      )}
      {role === "ACCOUNT_MANAGER" && (
        <fieldset className="flex flex-col gap-1.5 sm:col-span-2">
          <legend className="text-xs font-medium text-text-2">Assigned clients</legend>
          <div className="grid max-h-48 grid-cols-1 gap-1 overflow-y-auto rounded-md border border-border p-2 sm:grid-cols-2">
            {clients.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="clientIds" value={c.id} defaultChecked={assigned?.includes(c.id)} /> {c.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {role === "AGENCY_ADMIN" && <p className="text-xs text-text-3 sm:col-span-2">Administrators see every client and manage integrations, budgets, settings and the team.</p>}
    </>
  );
}

export function InviteForm({ clients }: { clients: ClientOpt[] }) {
  const [state, action, pending] = useActionState(inviteUser, undefined);
  const form = useFormSubmit(action, state?.ok && state);
  const [role, setRole] = useState<Role>("ACCOUNT_MANAGER");
  return (
    <form {...form} className="grid gap-3 sm:grid-cols-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="inv-name">Name</Label>
        <Input id="inv-name" name="name" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="inv-email">Email</Label>
        <Input id="inv-email" name="email" type="email" required />
      </div>
      <RoleFields role={role} setRole={setRole} clients={clients} />
      <div className="flex flex-col gap-2 sm:col-span-4">
        <Button type="submit" disabled={pending} className="self-start">{pending ? "Inviting…" : "Send invitation"}</Button>
        <Result state={state} />
      </div>
    </form>
  );
}

export function EditUserForm({ user, clients }: { user: { id: string; role: Role; clientId: string | null; assigned: string[] }; clients: ClientOpt[] }) {
  const [state, action, pending] = useActionState(updateUser, undefined);
  const form = useFormSubmit(action);
  const [role, setRole] = useState<Role>(user.role);
  return (
    <form {...form} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="userId" value={user.id} />
      <RoleFields role={role} setRole={setRole} clients={clients} clientId={user.clientId} assigned={user.assigned} />
      <div className="flex flex-col gap-2 sm:col-span-2">
        <Button type="submit" size="sm" disabled={pending} className="self-start">{pending ? "Saving…" : "Save access"}</Button>
        <Result state={state} />
      </div>
    </form>
  );
}

export function UserActions({ userId, active, invited, isSelf }: { userId: string; active: boolean; invited: boolean; isSelf: boolean }) {
  const [state, setState] = useState<TeamState>(undefined);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<TeamState>) => start(async () => setState(await fn()));
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {active && (
          <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => run(() => sendAccessLink(userId))}>
            {invited ? "Resend invitation" : "Send password reset"}
          </Button>
        )}
        {!isSelf &&
          (active ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-critical-ink"
              disabled={pending}
              onClick={() => confirm("Deactivate this user? They are signed out immediately and can't sign in until reactivated.") && run(() => setUserActive(userId, false))}
            >
              Deactivate
            </Button>
          ) : (
            <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => run(() => setUserActive(userId, true))}>Reactivate</Button>
          ))}
      </div>
      <Result state={state} />
    </div>
  );
}
