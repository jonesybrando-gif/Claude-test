"use client";

import { useEffect } from "react";
import "./globals.css";

/** Last-resort error page, used when the root layout itself fails. Replaces the whole document. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <main className="flex min-h-screen items-center justify-center p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6">
            <h1 className="text-lg font-semibold">Something went wrong</h1>
            <p className="mt-2 text-sm text-text-2">The page couldn&apos;t load. This is usually temporary. Try again, and if it keeps happening, sign out and back in.</p>
            {error.digest && <p className="mt-2 text-xs text-text-3">Reference: {error.digest}</p>}
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={reset} className="inline-flex h-9 items-center rounded-md bg-brand px-4 text-sm font-medium text-brand-ink hover:opacity-90">Try again</button>
              {/* A plain link: the app's router may be what failed. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a href="/" className="inline-flex h-9 items-center rounded-md border border-border px-4 text-sm font-medium hover:bg-surface-2">Go to the start page</a>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
