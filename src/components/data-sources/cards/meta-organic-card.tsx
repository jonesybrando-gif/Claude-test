import Link from "next/link";
import { prisma } from "@/server/db";
import { getCurrentUser } from "@/server/auth";
import { missingMetaOrganicEnv } from "@/server/data-sources/meta-organic/oauth";
import { relativeTime } from "@/lib/time";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { MetaOrganicDisconnect } from "./meta-organic-disconnect";

const CONNECT_HREF = "/api/data-sources/meta-organic/connect";
/** Long-lived Facebook user tokens cannot be refreshed; warn this many days before they expire. */
const EXPIRY_WARNING_DAYS = 10;

const STATUS_BADGE: Record<string, { label: string; variant: "good" | "warning" | "critical" | "neutral" }> = {
  ACTIVE: { label: "Connected", variant: "good" },
  NEEDS_REAUTH: { label: "Needs reconnecting", variant: "critical" },
  PENDING_APPROVAL: { label: "Waiting on Meta approval", variant: "warning" },
  DISCONNECTED: { label: "Disconnected", variant: "neutral" },
};

const fmtDate = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/** Integrations-page card for Facebook Pages + Instagram organic insights (META_ORGANIC). */
export async function MetaOrganicCard() {
  const user = await getCurrentUser();
  if (!user || user.role === "CLIENT_USER") return null;
  const admin = user.role === "AGENCY_ADMIN";
  const missing = missingMetaOrganicEnv();
  const connections = await prisma.dataSourceConnection.findMany({
    where: { agencyId: user.agencyId, provider: "META_ORGANIC", status: { not: "DISCONNECTED" } },
    include: { assets: { where: { status: { not: "DISCONNECTED" } }, select: { kind: true, name: true, lastError: true, lastSuccessfulSyncAt: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Facebook &amp; Instagram (organic)</CardTitle>
          <Badge variant={missing.length ? "warning" : connections.length ? "good" : "info"}>{missing.length ? "Waiting for API credentials" : connections.length ? "Connected" : "Ready to connect"}</Badge>
        </div>
        <CardDescription>Page and Instagram followers, reach, views, engagement and top posts from the Meta Graph API. Separate from the Meta Ads login.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {missing.length > 0 && <p className="text-xs text-warning-ink">Missing server settings: {missing.join(", ")}</p>}
        {connections.map((c) => {
          const badge = STATUS_BADGE[c.status] ?? STATUS_BADGE.ACTIVE;
          const pages = c.assets.filter((a) => a.kind === "FB_PAGE").length;
          const ig = c.assets.filter((a) => a.kind === "IG_ACCOUNT").length;
          const failing = c.assets.filter((a) => a.lastError);
          const lastSync = c.assets.map((a) => a.lastSuccessfulSyncAt?.toISOString()).filter((x): x is string => !!x).sort().at(-1) ?? null;
          const expiresAt = c.accessTokenExpiresAt;
          const daysLeft = expiresAt ? Math.floor((expiresAt.getTime() - Date.now()) / 86_400_000) : null;
          const expiringSoon = daysLeft !== null && daysLeft <= EXPIRY_WARNING_DAYS;
          return (
            <div key={c.id} className="rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{c.label}</span>
                <Badge variant={badge.variant}>{badge.label}</Badge>
              </div>
              <p className="mt-1 text-xs text-text-2">
                {pages} Page{pages === 1 ? "" : "s"} · {ig} Instagram account{ig === 1 ? "" : "s"} linked · last successful sync {relativeTime(lastSync)}
                {failing.length > 0 && <span className="text-critical-ink"> · {failing.length} failing</span>}
              </p>
              {expiresAt && (
                <p className={`mt-1 text-xs ${expiringSoon ? "text-critical-ink" : "text-text-3"}`}>
                  {daysLeft !== null && daysLeft < 0 ? "Authorization expired " : "Authorization expires "}
                  {fmtDate(expiresAt)}
                  {expiringSoon && (daysLeft! < 0 ? " — reconnect to resume syncing" : " — reconnect now to avoid a gap in syncing")}
                </p>
              )}
              {c.lastError && c.status !== "ACTIVE" && <p className="mt-1 text-xs text-critical-ink">{c.lastError}</p>}
              {c.status === "ACTIVE" && failing[0] && (
                <p className="mt-1 text-xs text-critical-ink">
                  {failing[0].name}: {failing[0].lastError}
                </p>
              )}
              {admin && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Link href={`/integrations/data-sources/${c.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                    Choose pages
                  </Link>
                  {(c.status === "NEEDS_REAUTH" || expiringSoon) && (
                    <a href={CONNECT_HREF} className={buttonVariants({ size: "sm" })}>
                      Reconnect
                    </a>
                  )}
                  <MetaOrganicDisconnect connectionId={c.id} />
                </div>
              )}
            </div>
          );
        })}
        <div>
          <p className="text-xs font-medium text-text-2">Known limitations</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-text-2">
            <li>Facebook logins last about 60 days and cannot be renewed automatically; reconnect before the date shown.</li>
            <li>Instagram must be a professional (business or creator) account linked to a Facebook Page.</li>
            <li>Instagram views, interactions, profile visits and website taps go back 90 days; new followers 30 days.</li>
            <li>Reach is unique per day; over a range it adds the days up.</li>
          </ul>
        </div>
        {admin ? (
          missing.length ? (
            <span className={`${buttonVariants({ variant: "outline" })} pointer-events-none self-start opacity-50`} aria-disabled>
              Connect (credentials needed)
            </span>
          ) : (
            <a href={CONNECT_HREF} className={`${buttonVariants()} self-start`}>
              Connect Facebook &amp; Instagram (pages)
            </a>
          )
        ) : (
          <span className="text-xs text-text-2">Ask an administrator to connect Facebook &amp; Instagram.</span>
        )}
      </CardContent>
    </Card>
  );
}
