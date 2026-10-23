import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth";
import { ROLE_LABEL } from "@/lib/team-policy";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PasswordForm, ProfileForm } from "./forms";

export const dynamic = "force-dynamic";

export const metadata = { title: "Your account" };

export default async function AccountPage() {
  const me = await requireUser();
  const u = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });
  const staff = u.role !== "CLIENT_USER";
  return (
    <div className="mx-auto flex max-w-[800px] flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold">Your account</h1>
        <p className="text-sm text-text-2">{u.email} · {ROLE_LABEL[u.role]}</p>
      </div>
      <Card>
        <CardHeader><CardTitle>Profile{staff ? " and notifications" : ""}</CardTitle></CardHeader>
        <CardContent><ProfileForm name={u.name} staff={staff} emailAlerts={u.emailAlerts} dailySummary={u.dailySummary} /></CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>Changing it signs you out everywhere else.</CardDescription>
        </CardHeader>
        <CardContent><PasswordForm email={u.email} /></CardContent>
      </Card>
    </div>
  );
}
