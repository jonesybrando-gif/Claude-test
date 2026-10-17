import { requireAdmin } from "@/server/access";
import { getAgencyTemplate } from "@/server/report-templates";
import { saveAgencyTemplateAction } from "@/server/report-template-actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TemplateForm } from "@/components/reports/template-form";

export const dynamic = "force-dynamic";

export default async function ReportSettingsPage() {
  const admin = await requireAdmin();
  const template = await getAgencyTemplate(admin.agencyId);
  return (
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
  );
}
