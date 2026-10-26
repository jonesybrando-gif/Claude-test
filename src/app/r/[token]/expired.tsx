import { brandStyle } from "@/lib/brand-color";

/**
 * Shown instead of a 404 when a shared report link no longer works. Branded
 * with the agency when the link existed (expired, turned off, or the client
 * was removed); generic when the token is unknown.
 */
export function ExpiredShareLink({ agency }: { agency: { name: string; brandColor: string; logoUrl: string | null } | null }) {
  return (
    <div className="min-h-screen" style={agency ? brandStyle(agency.brandColor) : undefined}>
      {agency && <div className="h-1.5 bg-brand" />}
      <main className="mx-auto flex max-w-md flex-col gap-4 px-4 py-16">
        {agency && (
          <div className="flex items-center gap-2">
            {agency.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={agency.logoUrl} alt="" className="h-8 w-8 rounded" />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded bg-brand text-sm font-bold text-brand-ink" aria-hidden>{agency.name.slice(0, 1)}</div>
            )}
            <span className="text-sm font-semibold">{agency.name}</span>
          </div>
        )}
        <div className="rounded-xl border border-border bg-surface p-5">
          <h1 className="text-lg font-semibold">This report link no longer works</h1>
          <p className="mt-2 text-sm text-text-2">
            {agency
              ? <>This report link has expired or was turned off. Ask {agency.name} for a new one.</>
              : <>This report link has expired, was turned off, or was copied incompletely. Ask whoever sent it to you for a new one.</>}
          </p>
        </div>
      </main>
    </div>
  );
}
