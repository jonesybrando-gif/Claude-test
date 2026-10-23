// Google Business Profile metrics (Business Profile Performance API + v4 reviews).
// Synced by src/server/data-sources/google/gbp.ts.
import type { DimensionDef, MetricDef } from "./types";

const m = (d: Omit<MetricDef, "source">): MetricDef => ({ ...d, source: "gbp" });

export const metrics: MetricDef[] = [
  // Views (profile impressions)
  m({ key: "gbp.views", label: "Profile views", short: "Views", format: "count", aggregation: "sum", better: "up", description: "Times the Business Profile was shown on Google Search and Maps (desktop + mobile)." }),
  m({ key: "gbp.searchViews", label: "Search views", format: "count", aggregation: "sum", better: "up", description: "Profile views on Google Search (desktop + mobile)." }),
  m({ key: "gbp.mapsViews", label: "Maps views", format: "count", aggregation: "sum", better: "up", description: "Profile views on Google Maps (desktop + mobile)." }),
  m({ key: "gbp.viewsDesktopSearch", label: "Desktop Search views", format: "count", aggregation: "sum", better: "up", description: "Profile views on Google Search from desktop devices." }),
  m({ key: "gbp.viewsMobileSearch", label: "Mobile Search views", format: "count", aggregation: "sum", better: "up", description: "Profile views on Google Search from mobile devices." }),
  m({ key: "gbp.viewsDesktopMaps", label: "Desktop Maps views", format: "count", aggregation: "sum", better: "up", description: "Profile views on Google Maps from desktop devices." }),
  m({ key: "gbp.viewsMobileMaps", label: "Mobile Maps views", format: "count", aggregation: "sum", better: "up", description: "Profile views on Google Maps from mobile devices." }),

  // Actions
  m({ key: "gbp.actions", label: "Profile actions", short: "Actions", format: "count", aggregation: "sum", better: "up", description: "Calls + website clicks + direction requests from the Business Profile." }),
  m({ key: "gbp.calls", label: "Calls", format: "count", aggregation: "sum", better: "up", description: "Taps on the call button in the Business Profile." }),
  m({ key: "gbp.websiteClicks", label: "Website clicks", format: "count", aggregation: "sum", better: "up", description: "Clicks on the website link in the Business Profile." }),
  m({ key: "gbp.directions", label: "Direction requests", short: "Directions", format: "count", aggregation: "sum", better: "up", description: "Requests for directions to the business." }),
  m({ key: "gbp.conversations", label: "Message conversations", short: "Messages", format: "count", aggregation: "sum", better: "up", description: "Message conversations started from the Business Profile." }),
  m({ key: "gbp.bookings", label: "Bookings", format: "count", aggregation: "sum", better: "up", description: "Bookings made through Reserve with Google from the Business Profile." }),
  m({ key: "gbp.foodOrders", label: "Food orders", format: "count", aggregation: "sum", better: "up", description: "Food orders placed from the Business Profile." }),

  // Search keywords (monthly; stored on the first day of each month)
  m({ key: "gbp.keywordImpressions", label: "Keyword impressions", format: "count", aggregation: "sum", better: "up", description: "Monthly impressions for the search terms that showed the Business Profile. Small values are reported by Google as a threshold (e.g. \"<15\"), stored as that threshold. Stored on the first day of each month.", dimensions: ["keyword"] }),

  // Reviews
  m({ key: "gbp.reviewCount", label: "Total reviews", short: "Reviews", format: "count", aggregation: "last", better: "up", description: "Total Google reviews as of the end of the period." }),
  m({ key: "gbp.averageRating", label: "Average rating", short: "Rating", format: "ratio", aggregation: "last", better: "up", description: "Average star rating of all Google reviews as of the end of the period." }),
  m({ key: "gbp.newReviews", label: "New reviews", format: "count", aggregation: "sum", better: "up", description: "Google reviews posted in the period." }),
  m({ key: "gbp.newReviewsStars", label: "New review stars", format: "count", aggregation: "sum", better: "up", description: "Sum of star ratings of reviews posted in the period (used for the new-review rating)." }),
  m({ key: "gbp.newReviewsRating", label: "New review rating", format: "ratio", aggregation: "weighted", ratioOf: { numerator: "gbp.newReviewsStars", denominator: "gbp.newReviews" }, better: "up", description: "Average star rating of reviews posted in the period." }),
];

export const dimensions: DimensionDef[] = [
  { key: "gbp.keyword", source: "gbp", dimension: "keyword", label: "Search keyword" },
];
