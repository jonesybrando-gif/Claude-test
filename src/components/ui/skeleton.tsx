import { cn } from "./cn";

/** A grey placeholder block shown while a page's data loads. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-surface-2", className)} aria-hidden />;
}

/** Generic page placeholder: a title, a row of tiles and a few cards. */
export function PageSkeleton({ tiles = 5 }: { tiles?: number }) {
  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5" role="status" aria-label="Loading">
      <Skeleton className="h-7 w-64" />
      <Skeleton className="h-4 w-96 max-w-full" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: tiles }, (_, i) => <Skeleton key={i} className="h-24" />)}
      </div>
      <Skeleton className="h-72" />
      <Skeleton className="h-48" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
