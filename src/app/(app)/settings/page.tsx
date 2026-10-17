import { prisma } from "@/server/db";
import { requireAdmin } from "@/server/access";
import { SettingsForm } from "./settings-form";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireAdmin();
  const a = await prisma.agency.findUniqueOrThrow({ where: { id: user.agencyId } });
  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-5">
      <h1 className="text-xl font-semibold">Settings</h1>
      <SettingsForm
        values={{
          name: a.name,
          brandColor: a.brandColor,
          logoUrl: a.logoUrl ?? "",
          reportHeader: a.reportHeader ?? "",
          reportFooter: a.reportFooter ?? "",
          under: Number(a.thresholdUnder),
          slightlyUnder: Number(a.thresholdSlightlyUnder),
          slightlyOver: Number(a.thresholdSlightlyOver),
          over: Number(a.thresholdOver),
        }}
      />
    </div>
  );
}
