import type { ReactNode } from "react";
import { cn } from "./cn";

// Placeholders for in-page <Suspense> boundaries. Deliberately not used from
// route-level loading.tsx files: those boundaries made value-returning server
// actions (share links, alerts "Check now") hang on their pending label.

/** A grey placeholder block shown while a section loads. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-border/60 motion-reduce:animate-none", className)} aria-hidden />;
}

/** Announces loading once to screen readers; wrap a group of skeletons in it. */
function Loading({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={className} role="status" aria-live="polite">
      <span className="sr-only">Loading…</span>
      {children}
    </div>
  );
}

function Tiles({ count }: { count: number }) {
  return (
    <div className={cn("grid grid-cols-2 gap-3", count >= 6 ? "md:grid-cols-3 xl:grid-cols-6" : "lg:grid-cols-5")}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-xl border border-border bg-surface px-4 py-3.5">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-3 w-16" />
        </div>
      ))}
    </div>
  );
}

function Cards({ count, tallFirst = true }: { count: number; tallFirst?: boolean }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-64 max-w-full" />
          <Skeleton className={i === 0 && tallFirst ? "h-56 w-full" : "h-32 w-full"} />
        </div>
      ))}
    </>
  );
}

/** A row of KPI tiles followed by content cards, for a section of a page. */
export function SectionSkeleton({ tiles = 0, cards = 1, tallFirst = true }: { tiles?: number; cards?: number; tallFirst?: boolean }) {
  return (
    <Loading className="flex flex-col gap-5">
      {tiles > 0 && <Tiles count={tiles} />}
      <Cards count={cards} tallFirst={tallFirst} />
    </Loading>
  );
}

/** Whole page body: title, a row of tiles, then content cards. */
export function PageSkeleton({ tiles = 5, cards = 2 }: { tiles?: number; cards?: number }) {
  return (
    <Loading className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-36" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>
      {tiles > 0 && <Tiles count={tiles} />}
      <Cards count={cards} />
    </Loading>
  );
}
