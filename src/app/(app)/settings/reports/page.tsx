import Link from "next/link";
import { requireAdmin } from "@/server/access";
import { listAgencySchedules } from "@/server/scheduled-reports";
import { describeSchedule } from "@/lib/report-schedule";
import { PRESET_LABEL } from "@/lib/date-ranges";
import { relativeTime } from "@/lib/time";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { getAgencyTemplate } from "@/server/report-templates";
import { saveAgencyTemplateAction } from "@/server/report-template-actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TemplateForm } from "@/components/reports/template-form";

export const dynamic = "force-dynamic";

export default async function ReportSettingsPage() {
  const admin = await requireAdmin();
  const [template, schedules] = await Promise.all([getAgencyTemplate(admin.agencyId), listAgencySchedules(admin.agencyId)]);
  return (
    <>
    <Card>
      <CardHeader>
        <CardTitle>Scheduled reports</CardTitle>
        <CardDescription>Clients whose report is emailed automatically. Set one up from a client&apos;s Share report → Share link page.</CardDescription>
      </CardHeader>
      {schedules.length === 0 ? (
        <CardContent className="text-sm text-text-3">No scheduled reports yet.</CardContent>
      ) : (
        <Table>
          <THead>
            <tr><TH className="pl-5">Client</TH><TH>Schedule</TH><TH>Covers</TH><TH>Recipients</TH><TH className="pr-5">Last sent</TH></tr>
          </THead>
          <TBody>
            {schedules.map(({ client, schedule, range }) => (
              <TR key={client.id}>
                <TD className="pl-5"><Link href={`/clients/${client.id}/share#schedule`} className="font-medium hover:underline">{client.name}</Link></TD>
                <TD>{schedule.enabled ? describeSchedule({ frequency: schedule.frequency === "weekly" ? "weekly" : "monthly", dayOfMonth: schedule.dayOfMonth, dayOfWeek: schedule.dayOfWeek }) : <Badge variant="neutral">Paused</Badge>}</TD>
                <TD>{PRESET_LABEL[range]}</TD>
                <TD className="max-w-72 truncate text-text-2" title={schedule.recipients.join(", ")}>{schedule.recipients.join(", ")}</TD>
                <TD className="pr-5 text-text-2">{schedule.lastSentAt ? relativeTime(schedule.lastSentAt.toISOString()) : "Not yet"}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
      <div className="h-3" />
    </Card>
    <Card>
      <CardHeader>
        <CardTitle>Default client report</CardTitle>
        <CardDescription>
          Every client report uses this layout unless the client has its own (open the client and choose “Customize report”).
          Branding (logo, colour, header and footer) comes from “Pacing &amp; branding”.
        </CardDescription>
      </CardHeader>
      <CardContent><TemplateForm template={template} action={saveAgencyTemplateAction} submitLabel="Save default layout" /></CardContent>
    </Card>
    </>
  );
}
