import Link from "next/link";
import { peekAuthToken } from "@/server/auth-tokens";
import { AuthCard } from "@/components/auth/auth-card";
import { SetPasswordForm } from "@/components/auth/set-password-form";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  const t = await peekAuthToken(token, "INVITE");
  if (!t) {
    return (
      <AuthCard title="This link can't be used" description="It may have expired or already been used.">
        <p className="text-sm text-text-2">Invitation links work once and expire after a while. If you already set your password, sign in. Otherwise, ask whoever invited you to send a new invitation.</p>
        <p className="mt-4 text-sm"><Link href="/login" className="font-medium underline">Go to sign in</Link></p>
      </AuthCard>
    );
  }
  return (
    <AuthCard title="Welcome — set your password" description={<>Signing in as <strong className="font-medium text-text">{t.user.email}</strong></>}>
      <SetPasswordForm kind="INVITE" token={token} email={t.user.email} />
    </AuthCard>
  );
}
