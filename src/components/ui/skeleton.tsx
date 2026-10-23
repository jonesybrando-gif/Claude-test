import { cn } from "./cn";

/** A grey placeholder block shown while a page loads. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-border/60", className)} aria-hidden />;
}

/** Shared page skeleton: title, a row of tiles, then content cards. */
export function PageSkeleton({ tiles = 5, cards = 2, tabs = false }: { tiles?: number; cards?: number; tabs?: boolean }) {
  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5" role="status" aria-live="polite">
      <span className="sr-only">Loading…</span>
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
      {tabs && (
        <div className="flex gap-4 border-b border-border pb-2">
          {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-4 w-16" />)}
        </div>
      )}
      {tiles > 0 && (
        <div className={cn("grid grid-cols-2 gap-3", tiles >= 6 ? "md:grid-cols-3 xl:grid-cols-6" : "lg:grid-cols-5")}>
          {Array.from({ length: tiles }, (_, i) => (
            <div key={i} className="flex flex-col gap-2 rounded-xl border border-border bg-surface px-4 py-3.5">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-7 w-24" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>
      )}
      {Array.from({ length: cards }, (_, i) => (
        <div key={i} className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-64 max-w-full" />
          <Skeleton className={i === 0 ? "h-56 w-full" : "h-32 w-full"} />
        </div>
      ))}
    </div>
  );
}
