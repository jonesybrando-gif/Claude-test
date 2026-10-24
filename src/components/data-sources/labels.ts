import type { DataAssetKind, DataSourceProvider } from "@prisma/client";

// Display names shared by the data-source picker and integration cards.

export const DATA_SOURCE_PROVIDER_LABEL: Record<DataSourceProvider, string> = {
  GOOGLE: "Google",
  META_ORGANIC: "Facebook & Instagram",
  CALLRAIL: "CallRail",
  DATAFORSEO: "Rank tracking (DataForSEO)",
};

export const DATA_ASSET_KIND_LABEL: Record<DataAssetKind, { one: string; many: string }> = {
  GA4_PROPERTY: { one: "Google Analytics property", many: "Google Analytics properties" },
  GSC_SITE: { one: "Search Console site", many: "Search Console sites" },
  GBP_LOCATION: { one: "Business Profile location", many: "Business Profile locations" },
  FB_PAGE: { one: "Facebook Page", many: "Facebook Pages" },
  IG_ACCOUNT: { one: "Instagram account", many: "Instagram accounts" },
  CALLRAIL_COMPANY: { one: "CallRail company", many: "CallRail companies" },
  RANK_PROJECT: { one: "Rank tracking project", many: "Rank tracking projects" },
};
