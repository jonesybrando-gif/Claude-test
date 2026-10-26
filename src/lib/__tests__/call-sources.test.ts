import { describe, expect, it } from "vitest";
import { isPaidCallSource } from "../call-sources";

describe("calls from ads (CallRail)", () => {
  it("counts ad-platform sources and paid media", () => {
    for (const s of ["Google Ads", "Google Paid", "Facebook Ads", "Instagram Ads", "Bing Ads", "Microsoft Advertising", "Google Local Services", "LSA", "Google AdWords"]) expect(isPaidCallSource(s, null)).toBe(true);
    for (const m of ["cpc", "PPC", "paid", "paid_social", "Paid Search"]) expect(isPaidCallSource("Website", m)).toBe(true);
  });

  it("leaves out organic, direct and listings", () => {
    for (const s of ["Google Organic", "Direct", "Google My Business", "Facebook", "Yelp", null]) expect(isPaidCallSource(s, "organic")).toBe(false);
    expect(isPaidCallSource("(unknown)", "(none)")).toBe(false);
  });
});
