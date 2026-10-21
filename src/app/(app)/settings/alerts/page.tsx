import { prisma } from "@/server/db";
import { requireAdmin } from "@/server/access";
import { emailConfigured } from "@/server/email";
import { resolveAlertSettings } from "@/lib/alerts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertSettingsForm, SlackForm } from "./form";

export const dynamic = "force-dynamic";

export default async function AlertSettingsPage() {
  const admin = await requireAdmin();
  const agency = await prisma.agency.findUniqueOrThrow({ where: { id: admin.agencyId }, select: { alertSettings: true, defaultTimezone: true, slackWebhookUrl: true } });
  return (
    <div className="flex flex-col gap-5">
    <Card>
      <CardHeader>
        <CardTitle>Alert thresholds</CardTitle>
        <CardDescription>
          Alerts go to administrators and to the managers assigned to each client: in the app, and by email for anyone who keeps email alerts on (Your account).
          Daily summaries go out on weekdays from 7:00 ({agency.defaultTimezone}).
          {!emailConfigured() && " Email isn't configured yet (SMTP_URL, EMAIL_FROM), so emails are recorded in the Email log only."}
        </CardDescription>
      </CardHeader>
      <CardContent><AlertSettingsForm s={resolveAlertSettings(agency.alertSettings)} /></CardContent>
    </Card>
    <Card>
      <CardHeader>
        <CardTitle>Slack</CardTitle>
        <CardDescription>Post new alerts to a Slack channel, grouped per check, with a link back to Alerts.</CardDescription>
      </CardHeader>
      <CardContent><SlackForm current={agency.slackWebhookUrl} /></CardContent>
    </Card>
    </div>
  );
}
