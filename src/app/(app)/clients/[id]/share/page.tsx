import Link from "next/link";
import { ChevronLeft, ExternalLink } from "lucide-react";
import { prisma } from "@/server/db";
import { requireClientEdit } from "@/server/access";
import { getClientTemplate } from "@/server/report-templates";
import { listShareLinks } from "@/server/share-links";
import { PRESET_LABEL } from "@/lib/date-ranges";
import { formatDate, relativeTime } from "@/lib/time";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { revokeShareLinkAction } from "./actions";
import { CopyButton, CreateShareLinkForm, RevokeButton } from "./forms";

export const dynamic = "force-dynamic";

const RANGES = ["mtd", "last_month", "last_7", "last_30", "last_90"] as const;

export default async function ShareLinksPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireClientEdit(id);
  const [client, { template }, links] = await Promise.all([
    prisma.client.findUniqueOrThrow({ where: { id }, select: { name: true } }),
    getClientTemplate(user.agencyId, id),
    listShareLinks(id),
  ]);
  const now = new Date();
  const ranges: [string, string][] = [["template", `Report default (${PRESET_LABEL[template.defaultRange].toLowerCase()})`], ...RANGES.map((r) => [r, PRESET_LABEL[r]] as [string, string])];

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-5">
      <div>
        <Link href={`/clients/${id}`} className="inline-flex items-center gap-1 text-sm text-text-2 hover:text-text"><ChevronLeft className="h-4 w-4" /> {client.name}</Link>
        <h1 className="mt-1 text-xl font-semibold">Share {client.name}&apos;s report</h1>
        <p className="text-sm text-text-2">
          Anyone with a link can view this client&apos;s report in their browser and download the PDF, without signing in. They see the client-facing version
          (the sections chosen in <Link className="underline" href={`/clients/${id}/report`}>Customize report</Link>), never your internal notes or AI suggestions.
          The figures update as new data syncs; ranges like “Last month” move forward with the calendar.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle>New link</CardTitle></CardHeader>
        <CardContent><CreateShareLinkForm clientId={id} ranges={ranges} /></CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Links</CardTitle>
          <CardDescription>Turn a link off at any time; it stops working immediately.</CardDescription>
        </CardHeader>
        {links.length === 0 ? (
          <CardContent><p className="text-sm text-text-3">No links yet.</p></CardContent>
        ) : (
          <Table>
            <THead>
              <tr><TH className="pl-5">Link</TH><TH>Range</TH><TH>Status</TH><TH className="text-right">Views</TH><TH>Last viewed</TH><TH className="pr-5 text-right">Actions</TH></tr>
            </THead>
            <TBody>
              {links.map((l) => {
                const expired = !!l.expiresAt && l.expiresAt <= now;
                const active = !l.revokedAt && !expired;
                return (
                  <TR key={l.id}>
                    <TD className="pl-5">
                      <div className="font-medium">{l.label ?? `${client.name} · report link`}</div>
                      <div className="text-xs text-text-3">Created {formatDate(l.createdAt.toISOString().slice(0, 10), { month: "short", day: "numeric", year: "numeric" })}</div>
                    </TD>
                    <TD className="text-sm">{l.range ? PRESET_LABEL[l.range as keyof typeof PRESET_LABEL] ?? l.range : "Report default"}</TD>
                    <TD>
                      {l.revokedAt ? <Badge variant="neutral">Turned off</Badge> : expired ? <Badge variant="warning">Expired</Badge> : <Badge variant="good">Active</Badge>}
                      {l.passwordHash && <Badge variant="neutral" className="ml-1">Password</Badge>}
                      <div className="mt-0.5 text-xs text-text-3">{active ? (l.expiresAt ? `Expires ${formatDate(l.expiresAt.toISOString().slice(0, 10))}` : "No expiry") : ""}</div>
                    </TD>
                    <TD className="text-right">{l.viewCount}</TD>
                    <TD className="text-sm text-text-2">{l.lastViewedAt ? relativeTime(l.lastViewedAt.toISOString()) : "Never"}</TD>
                    <TD className="pr-5">
                      <div className="flex flex-wrap justify-end gap-2">
                        {active && l.url && (
                          <>
                            <CopyButton text={l.url} label="Copy" />
                            <a href={l.url} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-3 text-xs hover:bg-surface-2"><ExternalLink className="h-3.5 w-3.5" aria-hidden /> Open</a>
                          </>
                        )}
                        {active && (
                          <RevokeButton action={revokeShareLinkAction.bind(null, id, l.id)} />
                        )}
                      </div>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
        <div className="h-3" />
      </Card>
    </div>
  );
}
