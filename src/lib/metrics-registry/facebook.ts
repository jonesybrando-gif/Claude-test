// Facebook Page organic metrics (Graph API Page Insights). Stored by
// src/server/data-sources/meta-organic/facebook.ts; see that file for which
// Graph metric feeds each key.
import type { DimensionDef, MetricDef } from "./types";

const m = (d: Omit<MetricDef, "source">): MetricDef => ({ source: "facebook", ...d });

export const metrics: MetricDef[] = [
  m({ key: "facebook.followers", label: "Page followers", short: "Followers", format: "count", aggregation: "last", better: "up", description: "People following the Page at the end of the period." }),
  m({ key: "facebook.newFollows", label: "New Page follows", short: "New follows", format: "count", aggregation: "sum", better: "up", description: "People who started following the Page." }),
  m({ key: "facebook.unfollows", label: "Page unfollows", short: "Unfollows", format: "count", aggregation: "sum", better: "down", description: "People who stopped following the Page." }),
  m({ key: "facebook.reach", label: "Facebook reach", short: "Reach", format: "count", aggregation: "sum", better: "up", description: "Daily unique accounts that saw any Page content, added up over the period (the same person on two days counts twice)." }),
  m({ key: "facebook.views", label: "Facebook views", short: "Views", format: "count", aggregation: "sum", better: "up", description: "Times Page content was played or displayed (Meta's replacement for impressions)." }),
  m({ key: "facebook.engagements", label: "Facebook post engagements", short: "Engagements", format: "count", aggregation: "sum", better: "up", description: "Reactions, comments, shares and clicks on the Page's posts." }),
  m({ key: "facebook.engagementRate", label: "Facebook engagement rate", short: "Eng. rate", format: "pct", aggregation: "weighted", ratioOf: { numerator: "facebook.engagements", denominator: "facebook.reach" }, better: "up", description: "Post engagements divided by reach." }),
  m({ key: "facebook.pageViews", label: "Page views", short: "Page views", format: "count", aggregation: "sum", better: "up", description: "Times the Page's profile was viewed." }),
  m({ key: "facebook.videoViews", label: "Facebook video views", short: "Video views", format: "count", aggregation: "sum", better: "up", description: "Times the Page's videos played for 3 seconds or more." }),
  m({ key: "facebook.postEngagements", label: "Post engagements", short: "Engagements", format: "count", aggregation: "sum", better: "up", description: "Reactions, comments and shares on each post so far, stored on the day it was published.", dimensions: ["post"] }),
];

export const dimensions: DimensionDef[] = [{ key: "facebook.post", source: "facebook", dimension: "post", label: "Post" }];
