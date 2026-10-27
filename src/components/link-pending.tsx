"use client";

import { useLinkStatus } from "next/link";

/**
 * Place inside a <Link>: shows that this link was clicked and its page is on
 * the way (a small spinner dot), so the tap is acknowledged at once.
 */
export function LinkPending({ className = "" }: { className?: string }) {
  const { pending } = useLinkStatus();
  return (
    <span aria-hidden className={`inline-block h-3 w-3 shrink-0 rounded-full border-2 border-brand/30 border-t-brand transition-opacity ${pending ? "animate-spin opacity-100" : "opacity-0"} ${className}`} />
  );
}
