import { Card } from "./ui/card";

export function StatTile({ label, value, sub, tone }: { label: string; value: string; sub?: React.ReactNode; tone?: "critical" | "good" }) {
  return (
    <Card className="px-4 py-3.5">
      <p className="text-xs text-text-3">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular ${tone === "critical" ? "text-critical-ink" : tone === "good" ? "text-good-ink" : "text-text"}`}>{value}</p>
      {sub && <div className="mt-0.5 text-xs text-text-2">{sub}</div>}
    </Card>
  );
}
