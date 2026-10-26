import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export const metadata = { title: "Page not found" };

/** Any unknown address, and pages someone isn't allowed to see (they 404 so as not to reveal what exists). */
export default function NotFound() {
  return (
    <main className="flex min-h-[70vh] items-center justify-center p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6">
        <h1 className="text-lg font-semibold">We couldn&apos;t find that page</h1>
        <p className="mt-2 text-sm text-text-2">
          The address may be mistyped, the page may have moved, or your account may not have access to it. If someone sent you this link, ask them to check it.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/clients" className={buttonVariants()}>Go to clients</Link>
          <Link href="/login" className={buttonVariants({ variant: "outline" })}>Sign in</Link>
        </div>
      </div>
    </main>
  );
}
