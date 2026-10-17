import { AlertTriangle, ArrowDownCircle, ArrowUpCircle, CheckCircle2, CircleDashed, MinusCircle } from "lucide-react";
import { Badge } from "./ui/badge";
import { STATUS_LABEL, type PacingStatus } from "@/lib/pacing/status";

// Status always carries an icon + label, never color alone.
const STYLE: Record<PacingStatus, { variant: "good" | "warning" | "serious" | "critical" | "neutral" | "info"; Icon: typeof CheckCircle2 }> = {
  OVERSPENDING: { variant: "critical", Icon: ArrowUpCircle },
  SLIGHTLY_OVER: { variant: "serious", Icon: ArrowUpCircle },
  ON_TARGET: { variant: "good", Icon: CheckCircle2 },
  SLIGHTLY_UNDER: { variant: "warning", Icon: ArrowDownCircle },
  UNDERSPENDING: { variant: "critical", Icon: ArrowDownCircle },
  NOT_STARTED: { variant: "neutral", Icon: CircleDashed },
  NO_BUDGET: { variant: "neutral", Icon: MinusCircle },
};

export function StatusBadge({ status }: { status: PacingStatus }) {
  const { variant, Icon } = STYLE[status];
  return (
    <Badge variant={variant}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {STATUS_LABEL[status]}
    </Badge>
  );
}

export function NoBudgetBadge() {
  return (
    <Badge variant="neutral">
      <MinusCircle className="h-3.5 w-3.5" aria-hidden />
      No budget
    </Badge>
  );
}

export function StaleBadge({ label = "Stale data" }: { label?: string }) {
  return (
    <Badge variant="warning">
      <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
      {label}
    </Badge>
  );
}

export function DemoBadge() {
  return <Badge variant="info">Demo data</Badge>;
}
