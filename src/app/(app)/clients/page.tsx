import Link from "next/link";
import { prisma } from "@/server/db";
import { requireAgencyStaff, visibleClientsWhere } from "@/server/access";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { PlatformLabel } from "@/components/platform-badge";
import { NewClientForm } from "./new-client-form";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const user = await requireAgencyStaff();
  const [clients, managers] = await Promise.all([
    prisma.client.findMany({
      where: visibleClientsWhere(user),
      include: { accounts: { select: { platform: true, isDemo: true } }, primaryManager: { select: { name: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({ where: { agencyId: user.agencyId, role: "ACCOUNT_MANAGER" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-5">
      <h1 className="text-xl font-semibold">Clients</h1>
      {user.role === "AGENCY_ADMIN" && (
        <Card>
          <CardHeader>
            <CardTitle>New client</CardTitle>
            <CardDescription>Advertising accounts are attached when you connect a platform under Integrations.</CardDescription>
          </CardHeader>
          <CardContent><NewClientForm managers={managers} /></CardContent>
        </Card>
      )}
      <Card>
        <Table>
          <THead>
            <tr><TH className="pl-5">Client</TH><TH>Platforms</TH><TH>Account manager</TH><TH className="pr-5">Timezone</TH></tr>
          </THead>
          <TBody>
            {clients.map((c) => (
              <TR key={c.id}>
                <TD className="pl-5"><Link className="font-medium hover:underline" href={`/clients/${c.id}`}>{c.name}</Link></TD>
                <TD className="text-xs"><div className="flex flex-wrap gap-3">{[...new Set(c.accounts.map((a) => a.platform))].map((p) => <PlatformLabel key={p} platform={p} />)}{c.accounts.length === 0 && <span className="text-text-3">No accounts yet</span>}</div></TD>
                <TD className="text-text-2">{c.primaryManager?.name ?? "Unassigned"}</TD>
                <TD className="pr-5 text-text-2">{c.timezone}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
