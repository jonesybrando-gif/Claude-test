import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/server/db";
import { requireClientEdit } from "@/server/access";
import { emailConfigured } from "@/server/email";
import { relativeTime } from "@/lib/time";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScheduleForm } from "./form";

export const dynamic = "force-dynamic";

export default async function SchedulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireClientEdit(id);
  const [client, s] = await Promise.all([
    prisma.client.findUniqueOrThrow({ where: { id }, select: { name: true, timezone: true } }),
    prisma.clientReportSchedule.findUnique({ where: { clientId: id } }),
  ]);
  return (
    <div className="mx-auto flex max-w-[800px] flex-col gap-5">
      <div>
        <Link href={`/clients/${id}`} className="inline-flex items-center gap-1 text-sm text-text-2 hover:text-text"><ChevronLeft className="h-4 w-4" /> {client.name}</Link>
        <h1 className="mt-1 text-xl font-semibold">Scheduled report email</h1>
        <p className="text-sm text-text-2">Email {client.name}&apos;s report automatically each month, using the report layout from Customize report.</p>
      </div>
      {!emailConfigured() && (
        <p className="rounded-lg border border-border bg-warning-bg px-4 py-3 text-sm text-warning-ink">
          Email isn&apos;t set up on the server yet (SMTP_URL and EMAIL_FROM), so scheduled reports are recorded in the Email log but not delivered.
        </p>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Schedule</CardTitle>
          <CardDescription>
            {s ? (s.active ? <>Next send: {s.nextRunAt.toLocaleString("en-US", { timeZone: client.timezone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} ({client.timezone})</> : "Paused") : "Not scheduled yet."}
            {s?.lastSentAt && <> · Last sent {relativeTime(s.lastSentAt.toISOString()).toLowerCase()}: {s.lastStatus}</>}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScheduleForm
            clientId={id}
            saved={!!s}
            values={s ? { dayOfMonth: s.dayOfMonth, recipients: s.recipients, range: s.range, attachPdf: s.attachPdf, includeLink: s.includeLink, active: s.active } : { dayOfMonth: 2, recipients: "", range: "last_month", attachPdf: true, includeLink: true, active: true }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
