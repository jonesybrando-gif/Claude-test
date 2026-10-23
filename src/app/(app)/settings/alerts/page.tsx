import { prisma } from "@/server/db";
import { requireAdmin } from "@/server/access";
import { emailConfigured } from "@/server/email";
import { resolveAlertSettings } from "@/lib/alerts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertSettingsForm, SlackForm } from "./form";
import { removeSlackWebhook } from "./actions";
import { ActionButton } from "@/components/action-button";

export const dynamic = "force-dynamic";

export default async function AlertSettingsPage() {
  const admin = await requireAdmin();
  const agency = await prisma.agency.findUniqueOrThrow({ where: { id: admin.agencyId }, select: { alertSettings: true, defaultTimezone: true, slackWebhookEnc: true } });
  return (
    <>
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
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle>Slack</CardTitle>
            <CardDescription>{agency.slackWebhookEnc ? "Connected: new alerts for every client are posted to your Slack channel after each check." : "Post new alerts to a Slack channel as well as in the app and by email."}</CardDescription>
          </div>
          {agency.slackWebhookEnc && <ActionButton action={removeSlackWebhook} label="Disconnect Slack" confirm="Stop posting alerts to Slack?" />}
        </div>
      </CardHeader>
      <CardContent>{agency.slackWebhookEnc ? <p className="text-sm text-text-2">To use a different channel, connect its webhook below; it replaces the current one.</p> : null}<div className={agency.slackWebhookEnc ? "mt-3" : ""}><SlackForm /></div></CardContent>
    </Card>
    </>
  );
}
