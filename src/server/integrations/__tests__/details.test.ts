import { describe, expect, it } from "vitest";
import { detailQuery, parseDetailRows } from "../google-ads/details";
import { creativeText, headlinesFromAds, parseAdInsights } from "../meta-ads/details";
import { formatDetail } from "../../ai/questions";

describe("Google Ads detail for AI questions", () => {
  it("builds read-only range queries that skip Local Services", () => {
    for (const kind of ["ads", "headlines", "keywords", "search_terms"] as const) {
      const q = detailQuery(kind, "2026-09-01", "2026-09-30");
      expect(q).toMatch(/^SELECT /);
      expect(q).toContain("segments.date BETWEEN '2026-09-01' AND '2026-09-30'");
      expect(q).toContain("!= 'LOCAL_SERVICES'");
    }
    expect(detailQuery("headlines", "2026-09-01", "2026-09-30")).toContain("performance_label");
    expect(detailQuery("headlines", "2026-09-01", "2026-09-30", false)).not.toContain("performance_label");
  });

  it("totals each headline across ad groups and keeps Google's rating", () => {
    const rows = parseDetailRows("headlines", [
      { campaign: { name: "Search" }, adGroup: { name: "A" }, asset: { textAsset: { text: "Same-day plumber" } }, adGroupAdAssetView: { fieldType: "HEADLINE", performanceLabel: "BEST" }, metrics: { impressions: "100", clicks: "10", costMicros: "20000000", conversions: 2 } },
      { campaign: { name: "Search" }, adGroup: { name: "B" }, asset: { textAsset: { text: "Same-day plumber" } }, adGroupAdAssetView: { fieldType: "HEADLINE", performanceLabel: "PENDING" }, metrics: { impressions: "50", clicks: "5", costMicros: "10000000", conversions: 1 } },
      { campaign: { name: "Search" }, adGroup: { name: "A" }, asset: { textAsset: { text: "Licensed and insured" } }, adGroupAdAssetView: { fieldType: "DESCRIPTION" }, metrics: { impressions: "80", clicks: "4", costMicros: "5000000", conversions: 0 } },
    ]);
    expect(rows[0]).toEqual({ label: "Same-day plumber", context: "2 ad groups", attributes: { type: "headline", google_rating: "best" }, costMinor: 3000, impressions: 150, clicks: 15, conversions: 3, conversionValueMinor: 0 });
    expect(rows[1]).toMatchObject({ label: "Licensed and insured", context: "Search › A", attributes: { type: "description" } });
  });

  it("parses ads, keywords and search terms", () => {
    const [ad] = parseDetailRows("ads", [
      {
        campaign: { name: "C" },
        adGroup: { name: "G" },
        adGroupAd: { status: "ENABLED", ad: { id: "9", type: "RESPONSIVE_SEARCH_AD", responsiveSearchAd: { headlines: [{ text: "H1" }, { text: "H2" }], descriptions: [{ text: "D1" }] }, finalUrls: ["https://x.test"] } },
        metrics: { costMicros: "1500000", impressions: "10", clicks: "1", conversions: 1, conversionsValue: 40 },
      },
    ]);
    expect(ad).toMatchObject({ label: "H1 | H2", context: "C › G", costMinor: 150, conversionValueMinor: 4000, attributes: { type: "responsive search ad", status: "enabled", headlines: "H1 | H2", descriptions: "D1", landing_page: "https://x.test" } });
    expect(parseDetailRows("keywords", [{ adGroupCriterion: { keyword: { text: "plumber near me", matchType: "PHRASE" }, status: "ENABLED" }, metrics: {} }])[0]).toMatchObject({ label: "plumber near me", attributes: { match_type: "phrase", status: "enabled" } });
    expect(parseDetailRows("search_terms", [{ searchTermView: { searchTerm: "free plumbing course", status: "NONE" }, metrics: { costMicros: "3000000" } }])[0]).toMatchObject({ label: "free plumbing course", costMinor: 300 });
  });
});

describe("Meta detail for AI questions", () => {
  it("reads ad text wherever Meta keeps it and totals by headline", () => {
    expect(creativeText({ creative: { object_story_spec: { link_data: { name: "Book today", message: "Fresh menu", link: "https://x.test" } } } })).toEqual({ headline: "Book today", primary_text: "Fresh menu", landing_page: "https://x.test" });
    const ads = parseAdInsights(
      [
        { ad_id: "1", ad_name: "Ad 1", campaign_name: "Leads", adset_name: "LA", spend: "50.00", impressions: "1000", clicks: "20", actions: [{ action_type: "lead", value: "5" }] },
        { ad_id: "2", ad_name: "Ad 2", campaign_name: "Leads", adset_name: "SD", spend: "30.00", impressions: "800", clicks: "10", actions: [{ action_type: "lead", value: "1" }] },
      ],
      { "1": { creative: { title: "Book today" } }, "2": { creative: { title: "Book today" } } },
    );
    expect(ads[0]).toMatchObject({ label: "Ad 1", context: "Leads › LA", costMinor: 5000, leads: 5, conversions: 5, attributes: { headline: "Book today" } });
    expect(headlinesFromAds(ads)).toEqual([{ label: "Book today", context: "2 ads", attributes: { type: "headline" }, costMinor: 8000, impressions: 1800, clicks: 30, conversions: 6, conversionValueMinor: 0, leads: 6 }]);
  });
});

describe("detail formatting for the AI", () => {
  it("lists the biggest spenders with cost per result, and keeps converting rows that would be cut", () => {
    const rows = Array.from({ length: 70 }, (_, i) => ({ label: `kw${i}`, context: "C › G", costMinor: (70 - i) * 100, impressions: 100, clicks: 5, conversions: i === 69 ? 2 : 0 }));
    const text = formatDetail(rows, "USD");
    expect(text.split("\n")[0]).toBe('- "kw0" [C › G] spend $70.00; impr 100; clicks 5; CTR 5%; conv 0; cost/result none');
    expect(text).toContain('"kw69"');
    expect(text).toContain("cost/result $0.50");
    expect(text).toContain("(9 more with less spend and no results not shown)");
  });
});
