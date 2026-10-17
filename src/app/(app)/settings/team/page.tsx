import { prisma } from "@/server/db";
import { requireAdmin } from "@/server/access";
import { emailConfigured } from "@/server/email";
import { ROLE_LABEL } from "@/lib/team-policy";
import { relativeTime } from "@/lib/time";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EditUserForm, InviteForm, UserActions } from "./forms";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const admin = await requireAdmin();
  const [users, clients] = await Promise.all([
    prisma.user.findMany({
      where: { agencyId: admin.agencyId },
      include: { assignments: { select: { clientId: true } }, client: { select: { name: true } } },
      orderBy: [{ deactivatedAt: { sort: "asc", nulls: "first" } }, { role: "asc" }, { name: "asc" }],
    }),
    prisma.client.findMany({ where: { agencyId: admin.agencyId, archivedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const clientName = new Map(clients.map((c) => [c.id, c.name]));

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader>
          <CardTitle>Invite someone</CardTitle>
          <CardDescription>
            They get a one-time link to set their own password (valid 72 hours).
            {!emailConfigured() && " No email provider is configured yet, so you'll get the link to share yourself."}
          </CardDescription>
        </CardHeader>
        <CardContent><InviteForm clients={clients} /></CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Team ({users.filter((u) => !u.deactivatedAt).length} active)</CardTitle>
          <CardDescription>Account managers see only their assigned clients. Client users get a read-only view of one client.</CardDescription>
        </CardHeader>
        <div className="divide-y divide-border border-t border-border">
          {users.map((u) => {
            const invited = !u.passwordHash;
            const active = !u.deactivatedAt;
            const access =
              u.role === "AGENCY_ADMIN" ? "All clients" : u.role === "CLIENT_USER" ? (u.client?.name ?? "—") : u.assignments.length ? u.assignments.map((a) => clientName.get(a.clientId)).filter(Boolean).join(", ") : "No clients assigned";
            return (
              <details key={u.id} className="group px-5 py-3">
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1">
                  <div className="min-w-48 flex-1">
                    <p className="font-medium">
                      {u.name} {u.id === admin.id && <span className="text-xs font-normal text-text-3">(you)</span>}
                    </p>
                    <p className="text-xs text-text-3">{u.email}</p>
                  </div>
                  <span className="w-44 text-sm text-text-2">{ROLE_LABEL[u.role]}</span>
                  <span className="min-w-48 flex-1 truncate text-sm text-text-2" title={access}>{access}</span>
                  <span className="w-36">
                    {!active ? <Badge variant="neutral">Deactivated</Badge> : invited ? <Badge variant="warning">Invitation pending</Badge> : <span className="text-xs text-text-3">Last sign-in {relativeTime(u.lastLoginAt?.toISOString() ?? null).toLowerCase()}</span>}
                  </span>
                  <span className="text-xs text-text-3 group-open:hidden">Edit ▸</span>
                </summary>
                <div className="mt-3 grid gap-4 rounded-lg bg-surface-2 p-4 lg:grid-cols-[2fr_1fr]">
                  {active ? <EditUserForm user={{ id: u.id, role: u.role, clientId: u.clientId, assigned: u.assignments.map((a) => a.clientId) }} clients={clients} /> : <p className="text-sm text-text-2">Reactivate this user to change their access.</p>}
                  <UserActions userId={u.id} active={active} invited={invited} isSelf={u.id === admin.id} />
                </div>
              </details>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
