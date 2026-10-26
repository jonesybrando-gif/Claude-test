"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";

/** Shown inside the app shell when a page fails to load, so navigation stays available. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 py-10">
      <div role="alert" className="rounded-xl border border-border bg-surface p-6">
        <h1 className="text-lg font-semibold">This page couldn&apos;t load</h1>
        <p className="mt-2 text-sm text-text-2">
          Something went wrong while loading it. This is usually temporary (for example, an ad platform or the database was slow to respond). Your data and settings are safe.
        </p>
        {error.digest && <p className="mt-2 text-xs text-text-3">Reference: {error.digest}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" onClick={reset}>Retry</Button>
          <Link href="/clients" className={buttonVariants({ variant: "outline" })}>Go to clients</Link>
        </div>
      </div>
    </div>
  );
}
