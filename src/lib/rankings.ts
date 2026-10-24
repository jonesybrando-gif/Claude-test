// Pure helpers for DataForSEO rank tracking, shared by the setup page (client
// and server) and the sync code. No DB or network access here.

export const MAX_KEYWORDS_PER_CLIENT = 500;
/** DataForSEO Standard queue, Google organic, about $0.0006 per keyword check. */
export const COST_PER_CHECK_USD = 0.0006;
export const DEFAULT_LOCATION_CODE = 2840;
export const DEFAULT_LANGUAGE_CODE = "en";

export type RankDevice = "desktop" | "mobile";
export type RankDeviceSetting = RankDevice | "both";

export interface RankProjectSettings {
  locationCode: number;
  languageCode: string;
  device: RankDeviceSetting;
  searchEngine: "google";
}

export const DEVICE_OPTIONS: { value: RankDeviceSetting; label: string }[] = [
  { value: "desktop", label: "Desktop" },
  { value: "mobile", label: "Mobile" },
  { value: "both", label: "Desktop and mobile" },
];

export const devicesFor = (d: RankDeviceSetting): RankDevice[] => (d === "both" ? ["desktop", "mobile"] : [d]);

/**
 * Common DataForSEO (= Google Ads geo target) location codes. Any other code
 * from DataForSEO's locations list can be entered by hand.
 */
export const COMMON_LOCATIONS: { group: string; items: { code: number; name: string }[] }[] = [
  { group: "Country", items: [{ code: 2840, name: "United States" }] },
  {
    group: "States",
    items: [
      { code: 21133, name: "Alabama" }, { code: 21132, name: "Alaska" }, { code: 21136, name: "Arizona" }, { code: 21135, name: "Arkansas" },
      { code: 21137, name: "California" }, { code: 21138, name: "Colorado" }, { code: 21139, name: "Connecticut" }, { code: 21141, name: "Delaware" },
      { code: 21140, name: "District of Columbia" }, { code: 21142, name: "Florida" }, { code: 21143, name: "Georgia" }, { code: 21144, name: "Hawaii" },
      { code: 21146, name: "Idaho" }, { code: 21147, name: "Illinois" }, { code: 21148, name: "Indiana" }, { code: 21145, name: "Iowa" },
      { code: 21149, name: "Kansas" }, { code: 21150, name: "Kentucky" }, { code: 21151, name: "Louisiana" }, { code: 21154, name: "Maine" },
      { code: 21153, name: "Maryland" }, { code: 21152, name: "Massachusetts" }, { code: 21155, name: "Michigan" }, { code: 21156, name: "Minnesota" },
      { code: 21158, name: "Mississippi" }, { code: 21157, name: "Missouri" }, { code: 21159, name: "Montana" }, { code: 21162, name: "Nebraska" },
      { code: 21166, name: "Nevada" }, { code: 21163, name: "New Hampshire" }, { code: 21164, name: "New Jersey" }, { code: 21165, name: "New Mexico" },
      { code: 21167, name: "New York" }, { code: 21160, name: "North Carolina" }, { code: 21161, name: "North Dakota" }, { code: 21168, name: "Ohio" },
      { code: 21169, name: "Oklahoma" }, { code: 21170, name: "Oregon" }, { code: 21171, name: "Pennsylvania" }, { code: 21172, name: "Rhode Island" },
      { code: 21173, name: "South Carolina" }, { code: 21174, name: "South Dakota" }, { code: 21175, name: "Tennessee" }, { code: 21176, name: "Texas" },
      { code: 21177, name: "Utah" }, { code: 21179, name: "Vermont" }, { code: 21178, name: "Virginia" }, { code: 21180, name: "Washington" },
      { code: 21183, name: "West Virginia" }, { code: 21182, name: "Wisconsin" }, { code: 21184, name: "Wyoming" },
    ],
  },
  {
    group: "Cities",
    items: [
      { code: 1015254, name: "Atlanta, GA" }, { code: 1026201, name: "Austin, TX" }, { code: 1016367, name: "Chicago, IL" },
      { code: 1026339, name: "Dallas, TX" }, { code: 1026481, name: "Houston, TX" }, { code: 1013962, name: "Los Angeles, CA" },
      { code: 1015116, name: "Miami, FL" }, { code: 1023191, name: "New York, NY" }, { code: 1013462, name: "Phoenix, AZ" },
      { code: 1014218, name: "San Diego, CA" }, { code: 1014221, name: "San Francisco, CA" }, { code: 1027744, name: "Seattle, WA" },
    ],
  },
];

const LOCATION_NAME = new Map(COMMON_LOCATIONS.flatMap((g) => g.items.map((i) => [i.code, i.name] as const)));
export const locationName = (code: number): string => LOCATION_NAME.get(code) ?? `Location ${code}`;

/** Bare host of a domain or URL: lowercase, no protocol/path/port, no leading "www.". "" if invalid. */
export function normalizeDomain(input: string): string {
  let s = (input ?? "").trim().toLowerCase();
  if (!s) return "";
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, "").replace(/^\/\//, "");
  s = s.split(/[/?#]/)[0].replace(/^[^@]*@/, "").replace(/:\d+$/, "").replace(/\.$/, "");
  s = s.replace(/^www\d?\./, "");
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(s) ? s : "";
}

/** True when `host` (domain or URL) is the target domain, its www form, or any subdomain of it. */
export function domainMatches(host: string, target: string): boolean {
  const h = normalizeDomain(host);
  const t = normalizeDomain(target);
  if (!h || !t) return false;
  return h === t || h.endsWith(`.${t}`);
}

/** One keyword per line (commas also split); trimmed, lowercased, whitespace-collapsed, de-duplicated. */
export function parseKeywordList(text: string): string[] {
  const out = new Set<string>();
  for (const raw of (text ?? "").split(/[\n\r,]+/)) {
    const k = raw.replace(/\s+/g, " ").trim().toLowerCase();
    if (k && k.length <= 200) out.add(k);
  }
  return [...out];
}

/** Daily and 30-day cost estimate for `keywords` tracked on `device`. */
export function rankCostEstimate(keywords: number, device: RankDeviceSetting): { checksPerDay: number; perDay: number; perMonth: number } {
  const checksPerDay = keywords * devicesFor(device).length;
  const perDay = checksPerDay * COST_PER_CHECK_USD;
  return { checksPerDay, perDay, perMonth: perDay * 30 };
}

export function readRankSettings(raw: unknown): RankProjectSettings & { pendingTasks: PendingRankTask[]; taskErrors: RankTaskError[] } {
  const s = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const device = s.device === "mobile" || s.device === "both" ? s.device : "desktop";
  const loc = Number(s.locationCode);
  return {
    locationCode: Number.isInteger(loc) && loc > 0 ? loc : DEFAULT_LOCATION_CODE,
    languageCode: typeof s.languageCode === "string" && s.languageCode ? s.languageCode : DEFAULT_LANGUAGE_CODE,
    device,
    searchEngine: "google",
    pendingTasks: Array.isArray(s.pendingTasks) ? (s.pendingTasks as PendingRankTask[]) : [],
    taskErrors: Array.isArray(s.taskErrors) ? (s.taskErrors as RankTaskError[]) : [],
  };
}

/** A posted DataForSEO task waiting to be collected (kept in DataAsset.settings.pendingTasks). */
export interface PendingRankTask {
  id: string;
  keywordId: string;
  /** Local date (asset time zone) the check counts for. */
  date: string;
  postedAt: string;
}

export interface RankTaskError { keyword: string; message: string; at: string }
