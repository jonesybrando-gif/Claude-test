import { summaryPending } from "@/server/exec-summary";

export const dynamic = "force-dynamic";

/**
 * Whether an AI summary is still being written (true/false only). Polled by
 * report pages, including shared report links, so it needs no sign-in and
 * reveals nothing about the report itself.
 */
export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get("k") ?? "";
  return Response.json({ pending: key.length > 0 && key.length < 300 && summaryPending(key) }, { headers: { "Cache-Control": "no-store" } });
}
