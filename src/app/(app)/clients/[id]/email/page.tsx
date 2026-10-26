import Link from "next/link";
import { clientBackHref } from "@/lib/client-nav";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/server/db";
import { requireClientEdit } from "@/server/access";
import { getClientTemplate } from "@/server/report-templates";
import { aiConfigured, EMAIL_PURPOSES } from "@/server/ai/assistant";
import { EmailComposer } from "@/components/ai/email-composer";

export const dynamic = "force-dynamic";

export default async function ClientEmailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const back = clientBackHref(id, await searchParams);
  const user = await requireClientEdit(id);
  const client = await prisma.client.findUniqueOrThrow({ where: { id }, select: { name: true, users: { where: { deactivatedAt: null }, select: { email: true } } } });
  const { template } = await getClientTemplate(user.agencyId, id);
  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-5">
      <div>
        <Link href={back} className="inline-flex items-center gap-1 text-sm text-text-2 hover:text-text"><ChevronLeft className="h-4 w-4" /> {client.name}</Link>
        <h1 className="mt-1 text-xl font-semibold">Email {client.name}</h1>
        <p className="text-sm text-text-2">Draft an update from this client&apos;s report data, edit it, then send it from the app.</p>
      </div>
      <EmailComposer clientId={id} purposes={EMAIL_PURPOSES} defaultTo={client.users.map((u) => u.email).join(", ")} defaultRange={template.defaultRange} aiOn={aiConfigured()} />
    </div>
  );
}
