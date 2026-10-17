import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth";
import { site } from "@/lib/site";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: site.appName, description: `Advertising reporting and budget pacing by ${site.company}.` };

const FEATURES = [
  ["Performance reporting", "Impressions, clicks, conversions, leads, cost per result and return on ad spend across Google Ads, Meta Ads, Microsoft Advertising and Google Local Services Ads, in one report."],
  ["Budget pacing", "Each client's monthly budget compared with actual spend every day, with a month-end forecast and the daily spend needed to land on budget."],
  ["Client reports", "Branded reports for each client: in the browser through a private link, or as a PDF."],
  ["Read-only by design", "The app only reads reporting data from the ad platforms. It never creates, changes or pauses campaigns, ads or budgets."],
];

export default async function HomePage() {
  const user = await getCurrentUser();
  if (user) redirect(user.role === "CLIENT_USER" && user.clientId ? `/clients/${user.clientId}` : "/dashboard");
  return (
    <div className="flex flex-col gap-10">
      <section className="flex max-w-[640px] flex-col gap-4">
        <h1 className="text-3xl font-semibold text-balance">{site.appName}</h1>
        <p className="text-lg text-text-2">
          {site.company} uses {site.appName} to report on its clients&apos; online advertising and to keep each client&apos;s ad spend on budget.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/login" className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-brand-ink hover:opacity-90">Sign in</Link>
          <Link href="/privacy" className="rounded-md border border-border px-4 py-2 text-sm hover:bg-surface-2">How we handle your data</Link>
        </div>
      </section>

      <section aria-label="What it does" className="grid gap-4 sm:grid-cols-2">
        {FEATURES.map(([title, body]) => (
          <div key={title} className="flex flex-col gap-1.5 rounded-xl border border-border bg-surface p-5">
            <h2 className="font-medium">{title}</h2>
            <p className="text-sm text-text-2">{body}</p>
          </div>
        ))}
      </section>

      <section className="flex max-w-[640px] flex-col gap-2">
        <h2 className="font-medium">Connecting ad accounts</h2>
        <p className="text-sm text-text-2">
          When an ad account is connected, {site.appName} asks Google, Meta or Microsoft for read-only access to that account&apos;s reporting data.
          The data is used only to produce reports for {site.company} and the client the account belongs to. It is never sold or used for advertising.
          Access can be removed at any time. The <Link className="underline" href="/privacy">privacy policy</Link> explains exactly what is collected and how to have it deleted.
        </p>
      </section>
    </div>
  );
}
