"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * While the AI summary is being written in the background, checks every few
 * seconds and refreshes the page's data once it's ready (scroll position and
 * open sections are kept). Gives up quietly after two minutes.
 */
export function RefreshWhenReady({ summaryKey }: { summaryKey: string }) {
  const router = useRouter();
  useEffect(() => {
    let stopped = false;
    const started = Date.now();
    const check = async () => {
      if (stopped) return;
      try {
        const r = await fetch(`/api/summary-status?k=${encodeURIComponent(summaryKey)}`, { cache: "no-store" });
        const { pending } = (await r.json()) as { pending: boolean };
        if (!pending) {
          router.refresh();
          return;
        }
      } catch {
        /* try again */
      }
      if (Date.now() - started < 120_000) timer = setTimeout(check, 3000);
    };
    let timer = setTimeout(check, 4000);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [summaryKey, router]);
  return null;
}
