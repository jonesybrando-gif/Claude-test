import { PLATFORM_LABEL, type PlatformKey } from "@/lib/platforms";

const DOT: Record<PlatformKey, string> = {
  GOOGLE_ADS: "#2a78d6",
  META_ADS: "#6250d6",
  MICROSOFT_ADS: "#1baf7a",
  GOOGLE_LSA: "#eda100",
};

export function PlatformLabel({ platform }: { platform: PlatformKey }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-text-2">
      <span className="h-2 w-2 rounded-full" style={{ background: DOT[platform] }} aria-hidden />
      {PLATFORM_LABEL[platform]}
    </span>
  );
}
