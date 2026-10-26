import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { requireAgencyStaff, visibleClientsWhere } from "@/server/access";
import { LABEL_COLORS } from "@/server/client-admin";
import { relativeTime } from "@/lib/time";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { PlatformLabel } from "@/components/platform-badge";
import { LabelBadge, type LabelInfo } from "@/components/label-badge";
import { ActionButton } from "@/components/action-button";
import { NewClientForm } from "./new-client-form";
import { BulkLabelBar, ClientFilters, LabelPicker, SelectAllBox, SelectClientBox } from "./client-list-controls";
import { DialogButton, RowMenu } from "./client-dialogs";
import { Plus, Tags } from "lucide-react";
import { bulkLabelAction, createLabelAction, deleteClientAction, deleteLabelAction, removeClientAction, restoreClientAction, setClientLabelsAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Clients" };

const COLOR_NAME: Record<string, string> = { neutral: "Grey", info: "Blue", good: "Green", warning: "Amber", serious: "Orange", critical: "Rose" };

type Sp = { q?: string; label?: string; sort?: string; group?: string; view?: string; notice?: string; error?: string; new?: string };

export default async function ClientsPage({ searchParams }: { searchParams: Promise<Sp> }) {
  const user = await requireAgencyStaff();
  const sp = await searchParams;
  const admin = user.role === "AGENCY_ADMIN";
  const removedView = admin && sp.view === "removed";

  const where: Prisma.ClientWhereInput = removedView ? { agencyId: user.agencyId, archivedAt: { not: null } } : visibleClientsWhere(user);
  if (sp.q?.trim()) where.name = { contains: sp.q.trim(), mode: "insensitive" };
  if (sp.label === "none") where.labels = { none: {} };
  else if (sp.label) where.labels = { some: { id: sp.label } };
  const orderBy: Prisma.ClientOrderByWithRelationInput = sp.sort === "za" ? { name: "desc" } : sp.sort === "newest" ? { createdAt: "desc" } : { name: "asc" };

  const [clients, managers, labels, removedCount] = await Promise.all([
    prisma.client.findMany({
      where,
      include: { accounts: { where: { status: { not: "DISCONNECTED" } }, select: { platform: true } }, primaryManager: { select: { name: true } }, labels: { select: { id: true, name: true, color: true }, orderBy: { name: "asc" } } },
      orderBy,
    }),
    prisma.user.findMany({ where: { agencyId: user.agencyId, role: "ACCOUNT_MANAGER" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.clientLabel.findMany({ where: { agencyId: user.agencyId }, select: { id: true, name: true, color: true, _count: { select: { clients: true } } }, orderBy: { name: "asc" } }),
    admin ? prisma.client.count({ where: { agencyId: user.agencyId, archivedAt: { not: null } } }) : Promise.resolve(0),
  ]);

  // Group by label: a client with several labels appears under each; unlabelled ones come last.
  const groups: { key: string; label: LabelInfo | null; rows: typeof clients }[] =
    sp.group === "label" && !removedView
      ? [
          ...labels.map((l) => ({ key: l.id, label: l as LabelInfo, rows: clients.filter((c) => c.labels.some((x) => x.id === l.id)) })),
          { key: "none", label: null, rows: clients.filter((c) => c.labels.length === 0) },
        ].filter((g) => g.rows.length)
      : [];
  if (groups.length === 0) groups.push({ key: "all", label: null, rows: clients });

  // Bulk labelling: a checkbox per row and a bar above the list (admins, once labels exist).
  const bulk = admin && !removedView;
  const returnQuery = new URLSearchParams(Object.entries({ q: sp.q, label: sp.label, sort: sp.sort, group: sp.group }).filter((e): e is [string, string] => !!e[1])).toString();

  const removeConfirm = (name: string) => `Remove ${name}? It disappears from lists, reports and alerts, its ad accounts stop syncing, and its share links stop working. History is kept and you can restore it later.`;
  const rowActions = (c: (typeof clients)[number]) =>
    removedView ? (
      <>
        <ActionButton action={restoreClientAction.bind(null, c.id)} label="Restore" />
        <ActionButton action={deleteClientAction.bind(null, c.id)} label="Delete permanently" variant="ghost" confirm={`Permanently delete ${c.name}? Its reports, budgets, history and settings are erased and can't be recovered.`} />
      </>
    ) : (
      <>
        <LabelPicker action={setClientLabelsAction.bind(null, c.id)} labels={labels} selected={c.labels.map((l) => l.id)} />
        <RowMenu label={`More actions for ${c.name}`}>
          <ActionButton action={removeClientAction.bind(null, c.id)} label="Remove client…" variant="ghost" confirm={removeConfirm(c.name)} />
        </RowMenu>
      </>
    );

  // Phones: one card per client instead of a wide table.
  const cards = (rows: typeof clients) => (
    <ul className="flex flex-col divide-y divide-border md:hidden" aria-label="Clients">
      {rows.map((c) => (
        <li key={c.id} className="flex items-start gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            {removedView ? <span className="font-medium">{c.name}</span> : <Link className="font-medium hover:underline" href={`/clients/${c.id}`}>{c.name}</Link>}
            <p className="mt-0.5 text-xs text-text-3">
              {[c.primaryManager?.name, c.accounts.length ? [...new Set(c.accounts.map((a) => a.platform))].length + " platform" + ([...new Set(c.accounts.map((a) => a.platform))].length === 1 ? "" : "s") : "No accounts linked", removedView ? `removed ${relativeTime(c.archivedAt?.toISOString() ?? null).toLowerCase()}` : null].filter(Boolean).join(" · ")}
            </p>
            {c.labels.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{c.labels.map((l) => <LabelBadge key={l.id} label={l} />)}</div>}
          </div>
          {admin && <div className="flex shrink-0 items-center gap-1">{rowActions(c)}</div>}
        </li>
      ))}
      {rows.length === 0 && <li className="px-4 py-8 text-center text-sm text-text-3">{removedView ? "No removed clients." : "No clients match these filters."}</li>}
    </ul>
  );

  const table = (rows: typeof clients) => (
    <div className="hidden md:block">
    <Table>
      <THead>
        <tr>
          {bulk && <TH className="w-10 pl-5"><SelectAllBox /></TH>}
          <TH className={bulk ? "" : "pl-5"}>Client</TH>
          <TH>Labels</TH>
          <TH>Platforms</TH>
          <TH>Account manager</TH>
          {removedView ? <TH>Removed</TH> : <TH>Time zone</TH>}
          {admin && <TH className="pr-5 text-right"><span className="sr-only">Actions</span></TH>}
        </tr>
      </THead>
      <TBody>
        {rows.map((c) => (
          <TR key={c.id}>
            {bulk && <TD className="w-10 pl-5"><SelectClientBox id={c.id} name={c.name} /></TD>}
            <TD className={bulk ? "" : "pl-5"}>{removedView ? <span className="font-medium">{c.name}</span> : <Link className="font-medium hover:underline" href={`/clients/${c.id}`}>{c.name}</Link>}</TD>
            <TD><div className="flex flex-wrap gap-1">{c.labels.map((l) => <LabelBadge key={l.id} label={l} />)}{c.labels.length === 0 && <span className="text-xs text-text-3">—</span>}</div></TD>
            <TD className="text-xs"><div className="flex flex-wrap gap-3">{[...new Set(c.accounts.map((a) => a.platform))].map((p) => <PlatformLabel key={p} platform={p} />)}{c.accounts.length === 0 && <span className="text-text-3">No accounts linked</span>}</div></TD>
            <TD className="text-text-2">{c.primaryManager?.name ?? <span className="text-text-3">—</span>}</TD>
            <TD className="text-text-2">{removedView ? relativeTime(c.archivedAt?.toISOString() ?? null) : c.timezone}</TD>
            {admin && (
              <TD className="pr-5">
                <div className="flex items-center justify-end gap-1">{rowActions(c)}</div>
              </TD>
            )}
          </TR>
        ))}
        {rows.length === 0 && (
          <tr><td colSpan={bulk ? 7 : 6} className="px-5 py-8 text-center text-sm text-text-3">{removedView ? "No removed clients." : "No clients match these filters."}</td></tr>
        )}
      </TBody>
    </Table>
    </div>
  );

  const labelsEditor = (
    <div className="flex flex-col gap-3">
      <form action={createLabelAction} className="flex flex-wrap items-center gap-2">
        <Input name="name" placeholder="New label, e.g. Restaurants" maxLength={40} required className="w-full sm:w-56" aria-label="Label name" />
        <Select name="color" defaultValue="info" className="w-full sm:w-28" aria-label="Label colour">
          {LABEL_COLORS.map((c) => <option key={c} value={c}>{COLOR_NAME[c]}</option>)}
        </Select>
        <Button type="submit" size="sm">Add label</Button>
      </form>
      {labels.length === 0 ? (
        <p className="text-sm text-text-3">No labels yet.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {labels.map((l) => (
            <li key={l.id} className="flex items-center gap-1 rounded-md border border-border py-0.5 pl-1.5 pr-0.5">
              <LabelBadge label={l} />
              <span className="text-xs text-text-3">{l._count.clients}</span>
              <span className="[&_button]:h-8 [&_button]:w-8 [&_button]:px-0">
                <ActionButton action={deleteLabelAction.bind(null, l.id)} label="×" variant="ghost" title={`Delete label ${l.name}`} confirm={`Delete the label “${l.name}”? It's removed from ${l._count.clients} client${l._count.clients === 1 ? "" : "s"}; nothing else changes.`} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
  const noClientsAtAll = !removedView && clients.length === 0 && !sp.q?.trim() && !sp.label;

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{removedView ? "Removed clients" : "Clients"}</h1>
        <div className="flex flex-wrap items-center gap-2">
          {admin && (removedView ? <Link href="/clients" className="text-sm text-brand-text hover:underline">Back to clients</Link> : removedCount > 0 && <Link href="/clients?view=removed" className="text-sm text-text-2 hover:underline">Removed clients ({removedCount})</Link>)}
          {admin && !removedView && (
            <>
              <DialogButton label="Manage labels" title="Labels" description="Group clients (for example by industry, region or service) to filter and sort them here and on Home." variant="outline" icon={<Tags className="h-4 w-4" aria-hidden />}>
                {labelsEditor}
              </DialogButton>
              <DialogButton label="New client" title="New client" description="Link its ad accounts afterwards from the client's Ad accounts page." defaultOpen={sp.new === "1"} icon={<Plus className="h-4 w-4" aria-hidden />}>
                <NewClientForm managers={managers} />
              </DialogButton>
            </>
          )}
        </div>
      </div>
      {sp.notice && <p className="rounded-lg border border-border bg-good-bg px-4 py-3 text-sm text-good-ink" role="status">{sp.notice}</p>}
      {sp.error && <p className="rounded-lg border border-border bg-critical-bg px-4 py-3 text-sm text-critical-ink" role="alert">{sp.error}</p>}

      {noClientsAtAll ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add your first client</CardTitle>
            <CardDescription className="text-sm text-text-2">
              {admin ? "Each client gets its own reports, budgets and alerts; use “New client” above, then link its ad accounts." : "No clients are assigned to you yet. Ask an administrator to assign you a client."}
            </CardDescription>
          </CardHeader>
          <CardContent />
        </Card>
      ) : (
      <>
      {!removedView && <ClientFilters labels={labels} />}
      {bulk && <BulkLabelBar labels={labels} action={bulkLabelAction} returnQuery={returnQuery} />}
      {groups.map((g) => (
        <Card key={g.key}>
          {g.key !== "all" && (
            <CardHeader>
              <CardTitle className="flex items-center gap-2">{g.label ? <LabelBadge label={g.label} /> : "No label"} <span className="text-sm font-normal text-text-3">{g.rows.length} client{g.rows.length === 1 ? "" : "s"}</span></CardTitle>
            </CardHeader>
          )}
          {table(g.rows)}
          {cards(g.rows)}
        </Card>
      ))}
      </>
      )}
    </div>
  );
}
