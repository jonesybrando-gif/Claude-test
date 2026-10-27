"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// A thin bar along the top of the window from the moment an in-app link is
// clicked until the next screen appears, so a click always visibly does
// something. Anything that navigates in code can call startNavigationProgress().

const START = "mn:navigation-start";

/** Show the bar for a navigation started in code (router.push). */
export function startNavigationProgress() {
  window.dispatchEvent(new Event(START));
}

function isInAppNavigation(e: MouseEvent): boolean {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
  const a = (e.target as Element | null)?.closest?.("a");
  if (!a || !a.href || a.hasAttribute("download") || (a.target && a.target !== "_self")) return false;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return false;
  // Same page (only the #hash differs) doesn't load anything.
  return !(url.pathname === location.pathname && url.search === location.search);
}

export function NavigationProgress() {
  const pathname = usePathname();
  const search = useSearchParams()?.toString();
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const loading = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const start = () => {
      timers.current.forEach(clearTimeout);
      loading.current = true;
      setState("loading");
      // Never leave the bar stuck (e.g. a link that was cancelled).
      timers.current = [
        setTimeout(() => {
          loading.current = false;
          setState("idle");
        }, 12_000),
      ];
    };
    const onClick = (e: MouseEvent) => {
      if (isInAppNavigation(e)) start();
    };
    // Capture phase: Next's <Link> marks the click handled before it would bubble up here.
    document.addEventListener("click", onClick, true);
    window.addEventListener(START, start);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener(START, start);
    };
  }, []);

  // The new screen has arrived: finish the bar and fade it out.
  useEffect(() => {
    if (!loading.current) return;
    loading.current = false;
    timers.current.forEach(clearTimeout);
    setState("done");
    timers.current = [setTimeout(() => setState("idle"), 300)];
  }, [pathname, search]);

  if (state === "idle") return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5">
      <div
        className={`h-full bg-brand ${state === "loading" ? "w-[85%]" : "w-full opacity-0 transition-[width,opacity] duration-300 ease-out"}`}
        style={state === "loading" ? { animation: "mn-progress-in 4s ease-out" } : undefined}
      />
    </div>
  );
}
