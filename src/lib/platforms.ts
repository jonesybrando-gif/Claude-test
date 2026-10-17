export type PlatformKey = "GOOGLE_ADS" | "META_ADS" | "MICROSOFT_ADS" | "GOOGLE_LSA";

export const PLATFORM_LABEL: Record<PlatformKey, string> = {
  GOOGLE_ADS: "Google Ads",
  META_ADS: "Meta Ads",
  MICROSOFT_ADS: "Microsoft Ads",
  GOOGLE_LSA: "Google LSA",
};

export const PLATFORM_SHORT: Record<PlatformKey, string> = {
  GOOGLE_ADS: "Google",
  META_ADS: "Meta",
  MICROSOFT_ADS: "Microsoft",
  GOOGLE_LSA: "LSA",
};

export const PLATFORMS: PlatformKey[] = ["GOOGLE_ADS", "META_ADS", "MICROSOFT_ADS", "GOOGLE_LSA"];
