import { ClientLogo } from "@/components/client-logo";

/** How the top of the client's report looks with this logo. */
export function ClientLogoPreview({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  return (
    <figure className="flex flex-col gap-2" aria-label="Preview">
      <figcaption className="text-xs font-medium text-text-3">Preview: top of the client&apos;s report</figcaption>
      <div className="flex items-center gap-3 rounded-lg border border-border bg-background px-4 py-3">
        <ClientLogo name={name} logoUrl={logoUrl} size="md" />
        <div className="min-w-0">
          <p className="text-[10px] font-semibold tracking-wider text-text-3 uppercase">Marketing report</p>
          <p className="truncate text-sm font-semibold">{name}</p>
        </div>
      </div>
    </figure>
  );
}
