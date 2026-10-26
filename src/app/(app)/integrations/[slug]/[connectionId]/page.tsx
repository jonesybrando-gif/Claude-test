import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/server/db";
import { requireAdmin } from "@/server/access";
import { getAdapter, platformForSlug } from "@/server/integrations/registry";
import { withAccessToken } from "@/server/integrations/tokens";
import { IntegrationError } from "@/server/integrations/errors";
import type { RemoteAccount } from "@/server/integrations/types";
import { PLATFORM_LABEL } from "@/lib/platforms";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AccountPicker } from "./account-picker";

export const dynamic = "force-dynamic";

export default async function ConnectionPage({ params }: { params: Promise<{ slug: string; connectionId: string }> }) {
  const { slug, connectionId } = await params;
  const platform = platformForSlug(slug);
  if (!platform) notFound();
  const user = await requireAdmin();
  const connection = await prisma.platformConnection.findFirst({ where: { id: connectionId, agencyId: user.agencyId, platform } });
  if (!connection) notFound();
  const adapter = getAdapter(platform);

  let accounts: RemoteAccount[] = [];
  let error: string | null = null;
  if (connection.status === "DISCONNECTED") {
    error = `This connection has been disconnected. Connect ${PLATFORM_LABEL[platform]} again to link accounts.`;
  } else {
    try {
      accounts = await withAccessToken(connection.id, adapter, (t) => adapter.listAccounts(t));
    } catch (e) {
      error = e instanceof IntegrationError ? `${e.kind}: ${e.message}` : `Could not load accounts from ${PLATFORM_LABEL[platform]}.`;
    }
  }

  const [clients, linked] = await Promise.all([
    prisma.client.findMany({ where: { agencyId: user.agencyId, archivedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.adAccount.findMany({ where: { platform: { in: adapter.linkablePlatforms }, client: { agencyId: user.agencyId }, isDemo: false, status: { not: "DISCONNECTED" } }, select: { platform: true, externalId: true, clientId: true } }),
  ]);
  // An account can be shared by several clients; those are managed on each client's Ad accounts page.
  const linkedTo: Record<string, string[]> = {};
  for (const l of linked) (linkedTo[`${l.platform}:${l.externalId}`] ??= []).push(l.clientId);
  const managers = accounts.filter((a) => a.isManager);
  const advertisers = accounts.filter((a) => !a.isManager);

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-5">
      <div>
        <Link href="/integrations" className="inline-flex items-center gap-1 text-sm text-text-2 hover:text-text"><ChevronLeft className="h-4 w-4" /> Integrations</Link>
        <h1 className="mt-1 text-xl font-semibold">{connection.label}</h1>
        <p className="text-sm text-text-2">Choose which accounts to monitor and which client each belongs to.</p>
      </div>
      {error ? (
        <Card><CardContent className="pt-5 text-sm text-critical-ink" role="alert">{error}</CardContent></Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{advertisers.length} advertising account{advertisers.length === 1 ? "" : "s"} found</CardTitle>
            <CardDescription>
              {managers.length > 0 && <>Through manager account{managers.length === 1 ? "" : "s"} {managers.map((m) => `${m.name} (${m.displayId ?? m.externalId})`).join(", ")}. </>}
              {adapter.linkablePlatforms.includes("GOOGLE_LSA") && <>Local Services campaigns are tracked separately: link an account under “Local Services Ads” to monitor them; they are always excluded from “Google Ads”. </>}
              Linking imports about 13 months of daily history, then syncs hourly. Choosing “Don&apos;t monitor” for a linked account stops syncing and keeps its history.
            </CardDescription>
          </CardHeader>
          <AccountPicker
            connectionId={connection.id}
            platforms={adapter.linkablePlatforms.map((p) => ({ key: p, label: PLATFORM_LABEL[p] }))}
            clients={clients}
            linkedTo={linkedTo}
            accounts={advertisers.map((a) => ({ externalId: a.externalId, display: a.displayId ?? a.externalId, name: a.name, currency: a.currency, timezone: a.timezone || "—", isTestAccount: !!a.isTestAccount, statusNote: a.statusNote ?? null }))}
          />
        </Card>
      )}
    </div>
  );
}
