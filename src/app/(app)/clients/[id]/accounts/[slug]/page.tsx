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
import { AccountChoice, type PickRow } from "../forms";

export const dynamic = "force-dynamic";

/** Choose which of a login's ad accounts belongs to this client. */
export default async function PickClientAccountPage({ params, searchParams }: { params: Promise<{ id: string; slug: string }>; searchParams: Promise<{ connection?: string }> }) {
  const { id, slug } = await params;
  const { connection: connectionId } = await searchParams;
  const platform = platformForSlug(slug);
  if (!platform || !connectionId) notFound();
  const user = await requireAdmin();
  const [client, connection] = await Promise.all([
    prisma.client.findFirst({ where: { id, agencyId: user.agencyId }, select: { id: true, name: true } }),
    prisma.platformConnection.findFirst({ where: { id: connectionId, agencyId: user.agencyId, platform, status: { not: "DISCONNECTED" } } }),
  ]);
  if (!client || !connection) notFound();
  const adapter = getAdapter(platform);

  let remote: RemoteAccount[] = [];
  let error: string | null = null;
  try {
    remote = (await withAccessToken(connection.id, adapter, (t) => adapter.listAccounts(t))).filter((a) => !a.isManager);
  } catch (e) {
    error = e instanceof IntegrationError ? e.message : `Could not load accounts from ${PLATFORM_LABEL[platform]}.`;
  }
  const live = await prisma.adAccount.findMany({
    where: { platform: { in: adapter.linkablePlatforms }, isDemo: false, status: { not: "DISCONNECTED" }, client: { agencyId: user.agencyId } },
    select: { platform: true, externalId: true, clientId: true, client: { select: { name: true } } },
  });
  const rows: PickRow[] = remote.map((a) => {
    const here = live.filter((l) => l.externalId === a.externalId);
    const other = here.find((l) => l.clientId !== id);
    return {
      externalId: a.externalId,
      display: a.displayId ?? a.externalId,
      name: a.name,
      currency: a.currency,
      timezone: a.timezone || "—",
      isTestAccount: !!a.isTestAccount,
      statusNote: a.statusNote ?? null,
      linkedElsewhere: other ? other.client.name : null,
      current: here.some((l) => l.clientId === id),
    };
  });
  const hasLsa = live.some((l) => l.clientId === id && l.platform === "GOOGLE_LSA");

  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-5">
      <div>
        <Link href={`/clients/${id}/accounts`} className="inline-flex items-center gap-1 text-sm text-text-2 hover:text-text"><ChevronLeft className="h-4 w-4" /> {client.name} · Ad accounts</Link>
        <h1 className="mt-1 text-xl font-semibold">Choose {client.name}&apos;s {PLATFORM_LABEL[platform]} account</h1>
        <p className="text-sm text-text-2">Accounts available to {connection.label}.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{error ? "Couldn't load accounts" : `${rows.length} account${rows.length === 1 ? "" : "s"}`}</CardTitle>
          {!error && rows.length === 0 && <CardDescription>This login has no advertising accounts. Try connecting with a different login.</CardDescription>}
        </CardHeader>
        <CardContent>
          {error ? <p className="text-sm text-critical-ink" role="alert">{error}</p> : rows.length > 0 && <AccountChoice clientId={id} connectionId={connection.id} rows={rows} google={platform === "GOOGLE_ADS"} defaultLsa={hasLsa} />}
        </CardContent>
      </Card>
    </div>
  );
}
