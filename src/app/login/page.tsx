import { LoginForm } from "./login-form";
import { site } from "@/lib/site";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BrandMark } from "@/components/brand-mark";

// Rendered per request so SHOW_DEMO_LOGINS can be toggled without a rebuild.
export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in" };

export default function LoginPage() {
  const showDemo = process.env.NODE_ENV !== "production" || process.env.SHOW_DEMO_LOGINS === "1";
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg"><BrandMark className="h-7 w-7" />{site.appName}</CardTitle>
            <CardDescription>Sign in to view your reports and dashboards.</CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm />
            <p className="mt-4 text-sm"><a href="/forgot-password" className="text-text-2 underline">Forgot your password?</a></p>
          </CardContent>
        </Card>
        {showDemo && (
          <div className="mt-4 rounded-lg border border-border bg-surface p-3 text-xs text-text-2">
            <p className="font-medium text-text">Demo logins (password: demo-password)</p>
            <ul className="mt-1 space-y-0.5">
              <li>admin@demo.test — agency administrator</li>
              <li>manager@demo.test — account manager (6 clients)</li>
              <li>client@demo.test — client user (ABC Plumbing, read-only)</li>
            </ul>
          </div>
        )}
      </div>
    </main>
  );
}
