import Link from "next/link";
import { peekAuthToken } from "@/server/auth-tokens";
import { AuthCard } from "@/components/auth/auth-card";
import { SetPasswordForm } from "@/components/auth/set-password-form";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  const t = await peekAuthToken(token, "PASSWORD_RESET");
  if (!t) {
    return (
      <AuthCard title="This link can't be used" description="It may have expired or already been used.">
        <p className="text-sm text-text-2">Ask your agency administrator to send a new one, or <Link className="underline" href="/forgot-password">request a reset</Link>.</p>
      </AuthCard>
    );
  }
  return (
    <AuthCard title="Choose a new password" description={<>Signing in as <strong className="font-medium text-text">{t.user.email}</strong></>}>
      <SetPasswordForm kind="PASSWORD_RESET" token={token} email={t.user.email} />
    </AuthCard>
  );
}
