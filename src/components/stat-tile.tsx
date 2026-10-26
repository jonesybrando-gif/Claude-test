import { MetricCard } from "./ui/metric-card";

/** A figure with a short line under it. Kept as a thin wrapper so older pages share the one MetricCard look. */
export function StatTile({ label, value, sub, tone, info }: { label: string; value: string; sub?: React.ReactNode; tone?: "critical" | "good"; info?: string }) {
  return <MetricCard label={label} value={value} info={info} valueTone={tone} change={sub ? <div className="text-text-2">{sub}</div> : undefined} size="md" />;
}
