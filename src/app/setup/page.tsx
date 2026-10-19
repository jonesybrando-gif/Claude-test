import { notFound } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { setupAvailable } from "@/server/first-run";
import { SetupForm } from "./form";

export const dynamic = "force-dynamic";

/** One-time creation of the first administrator; a 404 once anyone exists. */
export default async function SetupPage() {
  if (!(await setupAvailable())) notFound();
  return (
    <AuthCard title="Set up your agency" description="Create the administrator account. Next you'll choose your password.">
      <SetupForm />
    </AuthCard>
  );
}
