import "server-only";
import { cookies } from "next/headers";
import { RANGE_COOKIE, withRangeFallback } from "@/lib/client-nav";

/**
 * Page search params with the remembered date range (cookie set by
 * RangeControls) filled in when the URL has none. Use on staff report pages
 * only; share links and scheduled emails keep their own saved range.
 */
export async function withRememberedRange<T extends Record<string, string | undefined>>(sp: T): Promise<T> {
  const jar = await cookies();
  return withRangeFallback(sp, jar.get(RANGE_COOKIE)?.value);
}
