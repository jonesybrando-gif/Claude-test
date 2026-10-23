import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/server/db";
import { requireAdmin } from "@/server/access";
import { getDataSourceAdapter } from "@/server/data-sources/registry";
import { dataSourceAccessToken, readSecret } from "@/server/data-sources/credentials";
import type { DataSourceAdapter, RemoteAsset } from "@/server/data-sources/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AssetPicker, type PickerAsset } from "@/components/data-sources/asset-picker";
import { DATA_ASSET_KIND_LABEL, DATA_SOURCE_PROVIDER_LABEL } from "@/components/data-sources/labels";

export const dynamic = "force-dynamic";
export const metadata = { title: "Choose what to monitor" };

type MaybeWithWarnings = DataSourceAdapter & {
  listAssetsWithWarnings?: (ctx: Parameters<DataSourceAdapter["listAssets"]>[0]) => Promise<{ assets: RemoteAsset[]; warnings: string[] }>;
};

/** Shared asset picker for every non-ad data-source connection. */
export default async function DataSourceConnectionPage({ params }: { params: Promise<{ connectionId: string }> }) {
  const { connectionId } = await params;
  const user = await requireAdmin();
  const connection = await prisma.dataSourceConnection.findFirst({ where: { id: connectionId, agencyId: user.agencyId } });
  if (!connection) notFound();
  const adapter = getDataSourceAdapter(connection.provider) as MaybeWithWarnings | null;
  const providerLabel = DATA_SOURCE_PROVIDER_LABEL[connection.provider];

  let remote: RemoteAsset[] = [];
  let warnings: string[] = [];
  let error: string | null = null;
  if (connection.status === "DISCONNECTED") {
    error = `This connection has been disconnected. Connect ${providerLabel} again to link anything.`;
  } else if (!adapter) {
    error = `${providerLabel} is not available yet.`;
  } else {
    try {
      const accessToken = await dataSourceAccessToken(connection, adapter);
      const ctx = { connection, accessToken, secret: readSecret(connection) };
      if (adapter.listAssetsWithWarnings) ({ assets: remote, warnings } = await adapter.listAssetsWithWarnings(ctx));
      else remote = await adapter.listAssets(ctx);
    } catch (e) {
      error = `Could not load from ${providerLabel}: ${(e as Error).message}`;
    }
  }

  const [clients, linked] = await Promise.all([
    prisma.client.findMany({ where: { agencyId: user.agencyId, archivedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.dataAsset.findMany({
      where: { client: { agencyId: user.agencyId, archivedAt: null }, status: { not: "DISCONNECTED" }, ...(adapter ? { kind: { in: adapter.kinds } } : { connectionId: connection.id }) },
      select: { kind: true, externalId: true, clientId: true, connectionId: true, name: true, timezone: true },
      orderBy: { updatedAt: "desc" },
    }),
  ]);
  const linkedTo = new Map<string, string>();
  for (const l of linked) if (!linkedTo.has(`${l.kind}:${l.externalId}`)) linkedTo.set(`${l.kind}:${l.externalId}`, l.clientId);

  const assets: PickerAsset[] = remote.map((a) => ({
    kind: a.kind,
    externalId: a.externalId,
    name: a.name,
    group: a.group ?? null,
    timezone: a.timezone ?? null,
    linkedClientId: linkedTo.get(`${a.kind}:${a.externalId}`) ?? "",
  }));
  // Linked through this login but no longer visible to it: still listed so they can be unlinked.
  if (!error) {
    const seen = new Set(remote.map((a) => `${a.kind}:${a.externalId}`));
    for (const l of linked) {
      const k = `${l.kind}:${l.externalId}`;
      if (l.connectionId !== connection.id || seen.has(k)) continue;
      seen.add(k);
      assets.push({ kind: l.kind, externalId: l.externalId, name: l.name, group: "No longer accessible", timezone: l.timezone, linkedClientId: l.clientId, note: "This login can no longer see it. Choose “Don't monitor” to stop syncing." });
    }
  }
  const kindLabels: Record<string, string> = Object.fromEntries(Object.entries(DATA_ASSET_KIND_LABEL).map(([k, v]) => [k, v.many]));

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-5">
      <div>
        <Link href="/integrations" className="inline-flex items-center gap-1 text-sm text-text-2 hover:text-text"><ChevronLeft className="h-4 w-4" /> Integrations</Link>
        <h1 className="mt-1 text-xl font-semibold">{providerLabel}: {connection.label}</h1>
        <p className="text-sm text-text-2">Choose what to monitor and which client each belongs to.</p>
      </div>
      {error ? (
        <Card><CardContent className="pt-5 text-sm text-critical-ink" role="alert">{error}</CardContent></Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{remote.length} found</CardTitle>
            <CardDescription>
              Linking imports up to 13 months of daily history, then syncs hourly. Choosing “Don&apos;t monitor” stops syncing and keeps the data already imported.
            </CardDescription>
            {warnings.length > 0 && (
              <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-warning-ink" role="status">
                {warnings.map((w) => <li key={w}>{w}</li>)}
              </ul>
            )}
          </CardHeader>
          <AssetPicker connectionId={connection.id} clients={clients} assets={assets} kindLabels={kindLabels} />
        </Card>
      )}
    </div>
  );
}
