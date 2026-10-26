import Link from "next/link";
import { requireAgencyStaff } from "@/server/access";
import { prisma } from "@/server/db";
import { integrationStatus, type IntegrationState } from "@/server/integrations/registry";
import { PLATFORM_LABEL } from "@/lib/platforms";
import { relativeTime } from "@/lib/time";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { DisconnectButton } from "./disconnect-button";
import { TokenConnectForm } from "./token-connect-form";
import { DATA_SOURCE_CARDS } from "@/components/data-sources/cards";

export const dynamic = "force-dynamic";
export const metadata = { title: "Integrations" };

const STATE_BADGE: Record<IntegrationState, { label: string; variant: "neutral" | "warning" | "info" | "good" }> = {
  not_implemented: { label: "Not built yet", variant: "neutral" },
  awaiting_credentials: { label: "Built · waiting for API credentials", variant: "warning" },
  built_unverified: { label: "Ready to connect · not yet tested with a live account", variant: "info" },
  verified: { label: "Live", variant: "good" },
};

const CONNECTION_BADGE: Record<string, { label: string; variant: "good" | "warning" | "critical" | "neutral" }> = {
  ACTIVE: { label: "Connected", variant: "good" },
  NEEDS_REAUTH: { label: "Needs reconnecting", variant: "critical" },
  PENDING_APPROVAL: { label: "Waiting on platform approval", variant: "warning" },
  DISCONNECTED: { label: "Disconnected", variant: "neutral" },
};

export default async function IntegrationsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requireAgencyStaff();
  const { error } = await searchParams;
  const admin = user.role === "AGENCY_ADMIN";
  const [demoAccounts, connections] = await Promise.all([
    prisma.adAccount.groupBy({ by: ["platform"], where: { client: { agencyId: user.agencyId }, isDemo: true }, _count: true }),
    prisma.platformConnection.findMany({
      where: { agencyId: user.agencyId, credential: { isNot: null } },
      include: {
        credential: { select: { accessTokenExpiresAt: true, encryptedRefreshToken: true } },
        accounts: { select: { id: true, platform: true, status: true, lastSuccessfulSyncAt: true, syncRuns: { orderBy: { startedAt: "desc" }, take: 1, select: { status: true, error: true } } } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const notConfigured = error?.endsWith("_not_configured");

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Integrations</h1>
        <p className="text-sm text-text-2">Only official APIs and supported authentication are used. No scraping, no unofficial endpoints.</p>
      </div>
      {error && (
        <p role="alert" className="rounded-lg border border-border bg-critical-bg px-4 py-2 text-sm text-critical-ink">
          {notConfigured ? "That platform's API credentials are not configured on the server yet (see “Missing server settings” below)." : error}
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {integrationStatus().map((i) => {
          const demo = demoAccounts.find((d) => d.platform === i.platform)?._count ?? 0;
          const conns = i.slug ? connections.filter((c) => c.platform === i.platform) : [];
          const badge = STATE_BADGE[i.state];
          return (
            <Card key={i.platform}>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle>{PLATFORM_LABEL[i.platform]}</CardTitle>
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                </div>
                <CardDescription>{i.api}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm">
                {demo > 0 && <p className="text-xs text-info-ink">{demo} demo account{demo === 1 ? "" : "s"} use sample data for this platform.</p>}
                {i.missingEnv && i.missingEnv.length > 0 && (
                  <p className="text-xs text-warning-ink">Missing server settings: {i.missingEnv.join(", ")}</p>
                )}
                {conns.map((c) => {
                  const cb = CONNECTION_BADGE[c.status];
                  const failing = c.accounts.filter((a) => a.syncRuns[0]?.status === "FAILED").length;
                  const lastSync = c.accounts.map((a) => a.lastSuccessfulSyncAt?.toISOString()).filter(Boolean).sort().at(-1) ?? null;
                  // Tokens that cannot be refreshed (Meta Facebook Login) expire; warn ahead of time.
                  const expiresAt = c.credential && !c.credential.encryptedRefreshToken ? c.credential.accessTokenExpiresAt : null;
                  const daysLeft = expiresAt ? Math.floor((expiresAt.getTime() - Date.now()) / 86_400_000) : null;
                  return (
                    <div key={c.id} className="rounded-lg border border-border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium">{c.label}</span>
                        <Badge variant={cb.variant}>{cb.label}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-text-2">
                        {c.accounts.length} linked account{c.accounts.length === 1 ? "" : "s"}
                        {c.accounts.some((a) => a.platform === "GOOGLE_LSA") && ` (incl. ${c.accounts.filter((a) => a.platform === "GOOGLE_LSA").length} Local Services)`} · last successful sync {relativeTime(lastSync ?? null)}
                        {failing > 0 && <span className="text-critical-ink"> · {failing} failing</span>}
                      </p>
                      {daysLeft !== null && c.status === "ACTIVE" && (
                        <p className={`mt-1 text-xs ${daysLeft <= 7 ? "text-critical-ink" : "text-text-3"}`}>
                          Authorization expires {expiresAt!.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          {daysLeft <= 7 && " — reconnect now to avoid a gap in syncing"}
                        </p>
                      )}
                      {c.lastError && c.status !== "ACTIVE" && <p className="mt-1 text-xs text-critical-ink">{c.lastError}</p>}
                      {c.status === "ACTIVE" && failing > 0 && (
                        <p className="mt-1 text-xs text-critical-ink">Latest error: {c.accounts.find((a) => a.syncRuns[0]?.status === "FAILED")?.syncRuns[0]?.error}</p>
                      )}
                      {admin && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {c.status !== "DISCONNECTED" && <Link href={`/integrations/${i.slug}/${c.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>Choose accounts</Link>}
                          {(c.status === "NEEDS_REAUTH" || (daysLeft !== null && daysLeft <= 7)) && <a href={`/api/integrations/${i.slug}/connect`} className={buttonVariants({ size: "sm" })}>Reconnect</a>}
                          {c.status !== "DISCONNECTED" && <DisconnectButton connectionId={c.id} />}
                        </div>
                      )}
                    </div>
                  );
                })}
                <div>
                  <p className="text-xs font-medium text-text-2">Needed before connecting</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-text-2">{i.requirements.map((r) => <li key={r}>{r}</li>)}</ul>
                </div>
                <div>
                  <p className="text-xs font-medium text-text-2">Known limitations</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-text-2">{i.limitations.map((r) => <li key={r}>{r}</li>)}</ul>
                </div>
                {!i.slug ? (
                  <p className="text-xs text-text-2">
                    Uses your agency&apos;s Google Ads connection.{" "}
                    {admin &&
                      (connections.some((c) => c.platform === "GOOGLE_ADS")
                        ? <>Open “Choose accounts” on a Google Ads connection and pick clients in the “Local Services Ads” column.</>
                        : <>Set up the Google Ads connection first.</>)}
                  </p>
                ) : admin && i.state !== "awaiting_credentials" && i.state !== "not_implemented" ? (
                  <>
                    <a href={`/api/integrations/${i.slug}/connect`} className={`${buttonVariants()} self-start`}>Connect {PLATFORM_LABEL[i.platform]}</a>
                    {i.supportsTokenConnect && <TokenConnectForm platform={i.platform} />}
                  </>
                ) : (
                  <span className={`${buttonVariants({ variant: "outline" })} self-start pointer-events-none opacity-50`} aria-disabled>
                    {i.state === "not_implemented" ? "Connect (not available yet)" : admin ? "Connect (credentials needed)" : "Ask an administrator to connect"}
                  </span>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
      {DATA_SOURCE_CARDS.length > 0 && (
        <>
          <h2 className="mt-4 text-sm font-semibold text-text-2">Website, SEO, calls and social</h2>
          <div className="grid gap-4 lg:grid-cols-2">
            {DATA_SOURCE_CARDS.map(({ key, Card: SourceCard }) => <SourceCard key={key} />)}
          </div>
        </>
      )}
    </div>
  );
}
