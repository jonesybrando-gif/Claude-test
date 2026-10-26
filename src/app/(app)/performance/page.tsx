import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * The old "All clients" page. Its portfolio is now Clients › Performance, and
 * a single client's figures live on the client's own page; old links and
 * bookmarks land in the right place with their date range.
 */
export default async function PerformancePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const q = new URLSearchParams();
  for (const k of ["range", "compare", "from", "to"]) if (sp[k]) q.set(k, sp[k]!);
  if (sp.client && sp.client !== "all") redirect(`/clients/${encodeURIComponent(sp.client)}${q.size ? `?${q}` : ""}`);
  if (sp.client === "all") q.set("view", "combined");
  if (sp.attention === "1") q.set("filter", "attention");
  redirect(`/clients${q.size ? `?${q}` : ""}`);
}
