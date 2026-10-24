// Instagram professional account metrics (Graph API Instagram insights).
// Stored by src/server/data-sources/meta-organic/instagram.ts.
import type { DimensionDef, MetricDef } from "./types";

const m = (d: Omit<MetricDef, "source">): MetricDef => ({ source: "instagram", ...d });

export const metrics: MetricDef[] = [
  m({ key: "instagram.followers", label: "Instagram followers", short: "Followers", format: "count", aggregation: "last", better: "up", description: "Accounts following the profile at the end of the period." }),
  m({ key: "instagram.newFollowers", label: "New Instagram followers", short: "New followers", format: "count", aggregation: "sum", better: "up", description: "Accounts that started following (Instagram only reports the last 30 days)." }),
  m({ key: "instagram.mediaCount", label: "Instagram posts (total)", short: "Posts", format: "count", aggregation: "last", better: "up", description: "Total media published on the profile." }),
  m({ key: "instagram.reach", label: "Instagram reach", short: "Reach", format: "count", aggregation: "sum", better: "up", description: "Daily unique accounts that saw the profile's content, added up over the period." }),
  m({ key: "instagram.views", label: "Instagram views", short: "Views", format: "count", aggregation: "sum", better: "up", description: "Times content was played or displayed (replaces impressions). Last 90 days of history." }),
  m({ key: "instagram.accountsEngaged", label: "Accounts engaged", short: "Engaged", format: "count", aggregation: "sum", better: "up", description: "Accounts that interacted with content, counted per day." }),
  m({ key: "instagram.interactions", label: "Instagram interactions", short: "Interactions", format: "count", aggregation: "sum", better: "up", description: "Likes, comments, saves, shares and replies." }),
  m({ key: "instagram.engagementRate", label: "Instagram engagement rate", short: "Eng. rate", format: "pct", aggregation: "weighted", ratioOf: { numerator: "instagram.interactions", denominator: "instagram.reach" }, better: "up", description: "Interactions divided by reach." }),
  m({ key: "instagram.profileViews", label: "Instagram profile visits", short: "Profile visits", format: "count", aggregation: "sum", better: "up", description: "Times the profile was visited." }),
  m({ key: "instagram.websiteClicks", label: "Instagram website taps", short: "Website taps", format: "count", aggregation: "sum", better: "up", description: "Taps on the website link in the profile." }),
  m({ key: "instagram.postEngagements", label: "Post engagements", short: "Engagements", format: "count", aggregation: "sum", better: "up", description: "Interactions on each post so far, stored on the day it was published.", dimensions: ["post"] }),
  m({ key: "instagram.postReach", label: "Post reach", short: "Reach", format: "count", aggregation: "sum", better: "up", description: "Unique accounts that saw each post, stored on the day it was published.", dimensions: ["post"] }),
];

export const dimensions: DimensionDef[] = [{ key: "instagram.post", source: "instagram", dimension: "post", label: "Post" }];
