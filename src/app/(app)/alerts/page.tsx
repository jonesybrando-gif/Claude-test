import { redirect } from "next/navigation";

// Alerts now live in AI Insights, as "Issues". Old links (emails, Slack, bookmarks) keep working.
export default async function AlertsRedirect({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const q = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]);
  redirect(`/insights${q.size ? `?${q}` : ""}`);
}
