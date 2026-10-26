// Which CallRail calls came from paid ads. CallRail labels each call with a
// source ("Google Ads", "Facebook Ads", "Google Organic", "Direct"…) and a
// medium ("cpc", "organic"…). A call counts as "from ads" when either says
// paid: an ad-platform source (Google, Facebook/Instagram, Bing/Microsoft,
// Local Services) or a paid medium (cpc, ppc, paid…).

const PAID_SOURCE = [
  /\b(google|facebook|instagram|meta|bing|microsoft|yahoo|youtube|linkedin|tiktok)\s*(ads|adwords|paid|ppc|cpc|advertising)\b/i,
  /\badwords\b/i,
  /\blocal services\b/i,
  /\blsa\b/i,
];
const PAID_MEDIUM = /^(cpc|ppc|paid|paid[\s_-]?(search|social|media)|cpm|cpv|display|paidsearch|paidsocial)$/i;

export function isPaidCallSource(source: string | null | undefined, medium: string | null | undefined): boolean {
  const m = (medium ?? "").trim();
  if (m && PAID_MEDIUM.test(m)) return true;
  const s = (source ?? "").trim();
  return !!s && PAID_SOURCE.some((re) => re.test(s));
}
