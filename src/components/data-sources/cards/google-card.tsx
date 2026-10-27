import Link from "next/link";
import type { DataAssetKind } from "@prisma/client";
import { getCurrentUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { googleOAuthClient } from "@/server/data-sources/google/oauth";
import { GBP_ENABLED, GOOGLE_MODULES } from "@/server/data-sources/google/modules";
import { relativeTime } from "@/lib/time";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { DATA_ASSET_KIND_LABEL } from "../labels";
import { DisconnectDataSourceButton } from "../disconnect-data-source-button";

const CONNECTION_BADGE: Record<string, { label: string; variant: "good" | "warning" | "critical" | "neutral" }> = {
  ACTIVE: { label: "Connected", variant: "good" },
  NEEDS_REAUTH: { label: "Needs reconnecting", variant: "critical" },
  PENDING_APPROVAL: { label: "Waiting on approval", variant: "warning" },
  DISCONNECTED: { label: "Disconnected", variant: "neutral" },
};

/** Integrations-page card for the GOOGLE data-source login (Analytics, Search Console, Business Profile). */
export async function GoogleDataSourceCard() {
  const user = await getCurrentUser();
  if (!user) return null;
  const admin = user.role === "AGENCY_ADMIN";
  const configured = !!googleOAuthClient();
  const productNames = GBP_ENABLED ? "Analytics, Search Console, Business Profile" : "Analytics, Search Console";
  const connections = await prisma.dataSourceConnection.findMany({
    where: { agencyId: user.agencyId, provider: "GOOGLE", status: { not: "DISCONNECTED" } },
    include: { assets: { where: { status: { not: "DISCONNECTED" } }, select: { kind: true, status: true, lastSuccessfulSyncAt: true, lastError: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Google {productNames}</CardTitle>
          <Badge variant={configured ? "info" : "warning"}>{configured ? "Ready to connect" : "Waiting for API credentials"}</Badge>
        </div>
        <CardDescription>One Google login covers {GBP_ENABLED ? "GA4 properties, Search Console sites and Business Profile locations" : "GA4 properties and Search Console sites"}. Read-only, through the official Google APIs.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {!configured && <p className="text-xs text-warning-ink">Missing server settings: GOOGLE_DATA_CLIENT_ID, GOOGLE_DATA_CLIENT_SECRET</p>}
        {connections.map((c) => {
          const cb = CONNECTION_BADGE[c.status] ?? CONNECTION_BADGE.ACTIVE;
          const counts = GOOGLE_MODULES.map((m) => ({ kind: m.kind, n: c.assets.filter((a) => a.kind === m.kind).length }));
          const failing = c.assets.filter((a) => a.lastError);
          const lastSync = c.assets.map((a) => a.lastSuccessfulSyncAt?.toISOString()).filter(Boolean).sort().at(-1) ?? null;
          const granted = c.scopes ? new Set(c.scopes.split(/\s+/)) : null;
          const missing = granted ? GOOGLE_MODULES.filter((m) => !m.scopes.every((s) => granted.has(s))).map((m) => DATA_ASSET_KIND_LABEL[m.kind as DataAssetKind].one.replace(/ (property|site|location)$/, "")) : [];
          return (
            <div key={c.id} className="rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{c.label}</span>
                <Badge variant={cb.variant}>{cb.label}</Badge>
              </div>
              <p className="mt-1 text-xs text-text-2">
                {counts.map((x) => `${x.n} ${x.n === 1 ? DATA_ASSET_KIND_LABEL[x.kind].one : DATA_ASSET_KIND_LABEL[x.kind].many}`).join(" · ")}
              </p>
              <p className="text-xs text-text-2">
                Last successful sync {relativeTime(lastSync)}
                {failing.length > 0 && <span className="text-critical-ink"> · {failing.length} failing</span>}
              </p>
              {missing.length > 0 && <p className="mt-1 text-xs text-warning-ink">Access not granted for: {missing.join(", ")}. Reconnect and tick every box to add it.</p>}
              {c.lastError && c.status !== "ACTIVE" && <p className="mt-1 text-xs text-critical-ink">{c.lastError}</p>}
              {failing.length > 0 && <p className="mt-1 text-xs text-critical-ink">Latest error ({failing[0].name}): {failing[0].lastError}</p>}
              {admin && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <Link href={`/integrations/data-sources/${c.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>Choose properties</Link>
                  {(c.status === "NEEDS_REAUTH" || missing.length > 0) && configured && <a href="/api/data-sources/google/connect" className={buttonVariants({ size: "sm" })}>Reconnect</a>}
                  <DisconnectDataSourceButton
                    connectionId={c.id}
                    offerDelete
                    confirmText={`Disconnect this Google login? Access is revoked at Google and syncing stops for its ${productNames} links. Imported data is kept. Google Ads connections made with the same login keep working.`}
                  />
                </div>
              )}
            </div>
          );
        })}
        <div>
          <p className="text-xs font-medium text-text-2">Known limitations</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-text-2">
            <li>GA4 users are stored per day, so users over a range are a sum of daily users.</li>
            <li>Breakdowns keep the top 100 landing pages and top 50 sources per day.</li>
            <li>Each Google API must be enabled in the Google Cloud project behind the OAuth client.</li>
          </ul>
        </div>
        {admin && configured ? (
          <a href="/api/data-sources/google/connect" className={`${buttonVariants()} self-start`}>Connect Google ({productNames})</a>
        ) : (
          <span className={`${buttonVariants({ variant: "outline" })} self-start pointer-events-none opacity-50`} aria-disabled>
            {admin ? "Connect (credentials needed)" : "Ask an administrator to connect"}
          </span>
        )}
      </CardContent>
    </Card>
  );
}
