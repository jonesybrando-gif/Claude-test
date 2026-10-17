import { requireAgencyStaff } from "@/server/access";
import { prisma } from "@/server/db";
import { INTEGRATIONS } from "@/server/integrations/registry";
import { PLATFORM_LABEL } from "@/lib/platforms";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  const user = await requireAgencyStaff();
  const demoAccounts = await prisma.adAccount.groupBy({ by: ["platform"], where: { client: { agencyId: user.agencyId }, isDemo: true }, _count: true });
  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold">Integrations</h1>
        <p className="text-sm text-text-2">Only official APIs and supported authentication are used. No scraping, no unofficial endpoints.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {INTEGRATIONS.map((i) => {
          const demo = demoAccounts.find((d) => d.platform === i.platform)?._count ?? 0;
          return (
            <Card key={i.platform}>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle>{PLATFORM_LABEL[i.platform]}</CardTitle>
                  <Badge variant="neutral">Not connected · planned for phase {i.phase}</Badge>
                </div>
                <CardDescription>{i.api}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm">
                {demo > 0 && <p className="text-xs text-info-ink">{demo} demo account{demo === 1 ? "" : "s"} currently use sample data for this platform.</p>}
                <div>
                  <p className="text-xs font-medium text-text-2">Needed before connecting</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-text-2">{i.requirements.map((r) => <li key={r}>{r}</li>)}</ul>
                </div>
                <div>
                  <p className="text-xs font-medium text-text-2">Known limitations</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-text-2">{i.limitations.map((r) => <li key={r}>{r}</li>)}</ul>
                </div>
                <Button variant="outline" disabled className="self-start">Connect (not available yet)</Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
