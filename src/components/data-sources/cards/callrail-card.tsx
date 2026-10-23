import Link from "next/link";
import { requireAgencyStaff } from "@/server/access";
import { prisma } from "@/server/db";
import { relativeTime } from "@/lib/time";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { CallRailKeyForm } from "./callrail-key-form";
import { CallRailDisconnectButton } from "./callrail-disconnect-button";

const STATUS_BADGE: Record<string, { label: string; variant: "good" | "warning" | "critical" | "neutral" }> = {
  ACTIVE: { label: "Connected", variant: "good" },
  NEEDS_REAUTH: { label: "Key rejected · paste a new one", variant: "critical" },
  PENDING_APPROVAL: { label: "Pending", variant: "warning" },
  DISCONNECTED: { label: "Disconnected", variant: "neutral" },
};

export async function CallRailCard() {
  const user = await requireAgencyStaff();
  const admin = user.role === "AGENCY_ADMIN";
  const connections = await prisma.dataSourceConnection.findMany({
    where: { agencyId: user.agencyId, provider: "CALLRAIL", status: { not: "DISCONNECTED" } },
    select: {
      id: true,
      label: true,
      status: true,
      lastError: true,
      assets: {
        where: { kind: "CALLRAIL_COMPANY", status: { not: "DISCONNECTED" }, client: { archivedAt: null } },
        select: { id: true, name: true, lastSuccessfulSyncAt: true, lastError: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>CallRail</CardTitle>
          <Badge variant={connections.length ? "good" : "neutral"}>{connections.length ? "Connected" : "Not connected"}</Badge>
        </div>
        <CardDescription>Call tracking via the CallRail API v3: calls, answer rate, first-time callers, leads and form submissions by source and campaign.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {connections.map((c) => {
          const badge = STATUS_BADGE[c.status] ?? STATUS_BADGE.ACTIVE;
          const lastSync = c.assets.map((a) => a.lastSuccessfulSyncAt?.toISOString()).filter((d): d is string => !!d).sort().at(-1) ?? null;
          const failing = c.assets.filter((a) => a.lastError);
          return (
            <div key={c.id} className="rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{c.label}</span>
                <Badge variant={badge.variant}>{badge.label}</Badge>
              </div>
              <p className="mt-1 text-xs text-text-2">
                {c.assets.length} linked compan{c.assets.length === 1 ? "y" : "ies"} · last successful sync {relativeTime(lastSync)}
                {failing.length > 0 && <span className="text-critical-ink"> · {failing.length} failing</span>}
              </p>
              {c.lastError && c.status !== "ACTIVE" && <p className="mt-1 text-xs text-critical-ink">{c.lastError}</p>}
              {failing.length > 0 && <p className="mt-1 text-xs text-critical-ink">Latest error ({failing[0].name}): {failing[0].lastError}</p>}
              {admin && (
                <div className="mt-2 flex flex-col gap-2">
                  <div className="flex flex-wrap gap-2">
                    <Link href={`/integrations/data-sources/${c.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>Choose companies</Link>
                    <CallRailDisconnectButton connectionId={c.id} />
                  </div>
                  <details className="rounded-lg border border-border p-3 text-xs" open={c.status === "NEEDS_REAUTH"}>
                    <summary className="cursor-pointer font-medium text-text-2">Update API key</summary>
                    <div className="mt-2"><CallRailKeyForm connectionId={c.id} submitLabel="Save new key" /></div>
                  </details>
                </div>
              )}
            </div>
          );
        })}
        {admin ? (
          connections.length ? (
            <details className="rounded-lg border border-border p-3 text-xs">
              <summary className="cursor-pointer font-medium text-text-2">Connect another CallRail account</summary>
              <div className="mt-2"><CallRailKeyForm submitLabel="Connect CallRail" /></div>
            </details>
          ) : (
            <CallRailKeyForm submitLabel="Connect CallRail" />
          )
        ) : (
          !connections.length && <p className="text-xs text-text-2">Ask an administrator to connect CallRail.</p>
        )}
      </CardContent>
    </Card>
  );
}
