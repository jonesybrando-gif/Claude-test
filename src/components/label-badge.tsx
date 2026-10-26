export interface LabelInfo {
  id: string;
  name: string;
  color: string;
}

/**
 * Label colours are a categorical palette shown as a dot on a neutral chip,
 * so a label never looks like a pacing status (a red "Underspending" badge,
 * for example). The stored names are kept for compatibility.
 */
export const LABEL_DOT: Record<string, string> = {
  neutral: "#9a9993",
  info: "#2a78d6",
  good: "#1baf7a",
  warning: "#d9a400",
  serious: "#e07a4f",
  critical: "#c94f86",
};

export function LabelBadge({ label }: { label: LabelInfo }) {
  // Quiet by design: a coloured dot and the name in secondary text, no chip, so labels never compete with status.
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-text-2">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: LABEL_DOT[label.color] ?? LABEL_DOT.neutral }} aria-hidden />
      {label.name}
    </span>
  );
}
