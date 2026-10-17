import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { ForgotForm } from "./form";

export default function ForgotPasswordPage() {
  return (
    <AuthCard title="Reset your password" description="We'll email you a one-time link.">
      <ForgotForm />
      <p className="mt-4 text-sm"><Link href="/login" className="text-text-2 underline">Back to sign in</Link></p>
    </AuthCard>
  );
}
