export interface LabelInfo {
  id: string;
  name: string;
  color: string;
}

// Labels are neutral chips with a coloured dot, so they never read like a
// pacing status (red/amber/green badges). Older colour names still map.
const DOT: Record<string, string> = {
  neutral: "#8a8984",
  info: "#2a78d6",
  good: "#1f9d55",
  purple: "#7c4dff",
  teal: "#0f9b8e",
  pink: "#d6338a",
  warning: "#c98a00",
  serious: "#d9692f",
  critical: "#d6338a",
};

export const LABEL_COLOR_NAMES: Record<string, string> = { neutral: "Grey", info: "Blue", good: "Green", purple: "Purple", teal: "Teal", pink: "Pink" };

export function LabelBadge({ label }: { label: LabelInfo }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2 py-0.5 text-xs font-medium text-text-2">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: DOT[label.color] ?? DOT.neutral }} aria-hidden />
      {label.name}
    </span>
  );
}
