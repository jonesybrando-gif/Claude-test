import { Badge } from "./ui/badge";
import type { PacingStatus } from "@/lib/pacing/status";
import { BudgetStatus, StatusDot } from "./status-dot";

// Status is a dot plus plain words (On track, Over, Under, or a grey state),
// never colour alone and never a filled pill. Overspending gets a red dot,
// any other miss amber, on target green; the exact state is in the tooltip.

export function StatusBadge({ status, varianceMinor, currency }: { status: PacingStatus; varianceMinor?: number | null; currency?: string }) {
  return <BudgetStatus state={status} varianceMinor={varianceMinor} currency={currency} />;
}

export function NoBudgetBadge() {
  return <BudgetStatus state="NO_BUDGET" />;
}

/** A budget line with no ad account linked (or never synced): grey, never a pacing colour. */
export function NotConnectedBadge({ label = "Not connected" }: { label?: string }) {
  return <StatusDot tone="none">{label}</StatusDot>;
}

export function StaleBadge({ label = "Stale data" }: { label?: string }) {
  return <StatusDot tone="watch" detail="The latest data is older than expected">{label}</StatusDot>;
}

export function DemoBadge() {
  return <Badge variant="info">Demo data</Badge>;
}
