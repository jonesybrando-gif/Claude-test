import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/server/db";
import { requireAdmin } from "@/server/access";
import { getAdapter } from "@/server/integrations/registry";
import { withAccessToken } from "@/server/integrations/tokens";
import { IntegrationError } from "@/server/integrations/errors";
import { formatCustomerId } from "@/server/integrations/google-ads/gaql";
import type { RemoteAccount } from "@/server/integrations/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AccountPicker } from "./account-picker";

export const dynamic = "force-dynamic";

export default async function GoogleAdsConnectionPage({ params }: { params: Promise<{ connectionId: string }> }) {
  const { connectionId } = await params;
  const user = await requireAdmin();
  const connection = await prisma.platformConnection.findFirst({ where: { id: connectionId, agencyId: user.agencyId, platform: "GOOGLE_ADS" } });
  if (!connection) notFound();

  let accounts: RemoteAccount[] = [];
  let error: string | null = null;
  if (connection.status === "DISCONNECTED") {
    error = "This connection has been disconnected. Connect Google Ads again to link accounts.";
  } else {
    try {
      const adapter = getAdapter("GOOGLE_ADS")!;
      accounts = await withAccessToken(connection.id, adapter, (t) => adapter.listAccounts(t));
    } catch (e) {
      error = e instanceof IntegrationError ? `${e.kind}: ${e.message}` : "Could not load accounts from Google Ads.";
    }
  }

  const [clients, linked] = await Promise.all([
    prisma.client.findMany({ where: { agencyId: user.agencyId, archivedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.adAccount.findMany({ where: { platform: "GOOGLE_ADS", client: { agencyId: user.agencyId }, isDemo: false }, select: { externalId: true, clientId: true } }),
  ]);
  const linkedTo = Object.fromEntries(linked.map((l) => [l.externalId, l.clientId]));
  const managers = accounts.filter((a) => a.isManager);
  const advertisers = accounts.filter((a) => !a.isManager);

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-5">
      <div>
        <Link href="/integrations" className="inline-flex items-center gap-1 text-sm text-text-2 hover:text-text"><ChevronLeft className="h-4 w-4" /> Integrations</Link>
        <h1 className="mt-1 text-xl font-semibold">{connection.label}</h1>
        <p className="text-sm text-text-2">Choose which Google Ads accounts to monitor and which client each belongs to.</p>
      </div>
      {error ? (
        <Card><CardContent className="pt-5 text-sm text-critical-ink" role="alert">{error}</CardContent></Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{advertisers.length} advertising account{advertisers.length === 1 ? "" : "s"} found</CardTitle>
            <CardDescription>
              {managers.length > 0 && <>Through manager account{managers.length === 1 ? "" : "s"} {managers.map((m) => `${m.name} (${formatCustomerId(m.externalId)})`).join(", ")}. </>}
              Linking an account imports about 13 months of daily history, then syncs hourly.
            </CardDescription>
          </CardHeader>
          <AccountPicker
            connectionId={connection.id}
            clients={clients}
            accounts={advertisers.map((a) => ({ externalId: a.externalId, display: formatCustomerId(a.externalId), name: a.name, currency: a.currency, timezone: a.timezone, isTestAccount: !!a.isTestAccount, linkedClientId: linkedTo[a.externalId] ?? "" }))}
          />
        </Card>
      )}
    </div>
  );
}
