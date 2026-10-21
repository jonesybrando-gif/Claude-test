import { Badge } from "@/components/ui/badge";

export interface LabelInfo {
  id: string;
  name: string;
  color: string;
}

const TONES = ["neutral", "info", "good", "warning", "serious", "critical"] as const;
type Tone = (typeof TONES)[number];

export function LabelBadge({ label }: { label: LabelInfo }) {
  const tone: Tone = (TONES as readonly string[]).includes(label.color) ? (label.color as Tone) : "neutral";
  return <Badge variant={tone}>{label.name}</Badge>;
}
