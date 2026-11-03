import type { ReactNode } from "react";
import { ClientLogo } from "@/components/client-logo";
import { DemoBadge } from "@/components/status-badge";

/**
 * The top of a client-facing report: the client's own logo and name (never
 * the agency's), the period, and a slot for actions such as the date range
 * and Download PDF.
 */
export function ClientReportHeader({ name, logoUrl, kicker = "Marketing report", period, isDemo = false, below, actions }: { name: string; logoUrl: string | null; kicker?: string; period: ReactNode; isDemo?: boolean; below?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 items-center gap-4">
        <ClientLogo name={name} logoUrl={logoUrl} size="lg" />
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wider text-text-3 uppercase">{kicker}</p>
          <div className="flex items-center gap-2">
            <h1 className="truncate text-2xl font-bold tracking-tight md:text-[28px]">{name}</h1>
            {isDemo && <DemoBadge />}
          </div>
          <p className="text-sm text-text-2">{period}</p>
          {below && <div className="mt-1.5">{below}</div>}
        </div>
      </div>
      {actions && <div className="flex min-w-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
