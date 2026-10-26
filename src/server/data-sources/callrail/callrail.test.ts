import { describe, expect, it } from "vitest";
import type { DataAsset, DataSourceConnection } from "@prisma/client";
import type { MetricRow } from "../types";
import { CallRailError, callrailGet, listCallRailCompanies, validateCallRailKey } from "./client";
import { callsToRows, formsToRows, isAnswered, localDate, type CallRailCall } from "./metrics";
import { fetchCallRailMetrics, listCallRailAssets } from "./adapter";

const KEY = "abc123secretKEY";
const json = (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" }, ...init });

/** Fake fetch: routes by pathname (+ optional query matcher), records URLs and headers. */
function fakeFetch(routes: ((u: URL) => Response | undefined)[]) {
  const calls: { url: URL; auth: string | null }[] = [];
  const fn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({ url, auth: new Headers(init?.headers).get("authorization") });
    for (const r of routes) {
      const res = r(url);
      if (res) return res;
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
  return { fn, calls };
}
const noSleep = async () => {};
const failure = (p: Promise<unknown>): Promise<CallRailError> => p.then(() => { throw new Error("expected a failure"); }, (e: unknown) => e as CallRailError);

const pick = (rows: MetricRow[], metric: string, date: string, dimension = "", dimensionValue = "") =>
  rows.find((r) => r.metric === metric && r.date === date && (r.dimension ?? "") === dimension && (r.dimensionValue ?? "") === dimensionValue)?.value;

describe("call → daily bucket mapping", () => {
  const base = { answered: true, voicemail: false, duration: 60 };

  it("buckets by the local date in the asset time zone, not UTC", () => {
    // 2026-10-02 04:30 UTC is still Oct 1 in Los Angeles but Oct 2 in New York (00:30).
    const calls: CallRailCall[] = [{ id: "1", start_time: "2026-10-02T04:30:00.000Z", ...base }];
    const la = callsToRows(calls, { timeZone: "America/Los_Angeles", from: "2026-10-01", to: "2026-10-02" });
    expect(pick(la, "callrail.calls", "2026-10-01")).toBe(1);
    expect(pick(la, "callrail.calls", "2026-10-02")).toBe(0);
    const ny = callsToRows(calls, { timeZone: "America/New_York", from: "2026-10-01", to: "2026-10-02" });
    expect(pick(ny, "callrail.calls", "2026-10-01")).toBe(0);
    expect(pick(ny, "callrail.calls", "2026-10-02")).toBe(1);
  });

  it("falls back to the date written in the timestamp without a usable time zone", () => {
    expect(localDate("2026-10-01T23:30:00.000-07:00", null)).toBe("2026-10-01");
    expect(localDate("2026-10-01T23:30:00.000-07:00", "Not/AZone")).toBe("2026-10-01");
    expect(localDate("2026-10-01T23:30:00.000-07:00", "UTC")).toBe("2026-10-02");
  });

  it("drops calls outside the window and fills quiet days with zeros", () => {
    const rows = callsToRows([{ id: "x", start_time: "2026-09-30T12:00:00-07:00", ...base }], { timeZone: "America/Los_Angeles", from: "2026-10-01", to: "2026-10-03" });
    expect(rows.filter((r) => r.metric === "callrail.calls" && !r.dimension).map((r) => [r.date, r.value])).toEqual([["2026-10-01", 0], ["2026-10-02", 0], ["2026-10-03", 0]]);
  });

  it("splits answered vs missed (unanswered or voicemail) and computes durations, leads and first-time callers", () => {
    expect(isAnswered({ answered: true, voicemail: false })).toBe(true);
    expect(isAnswered({ answered: true, voicemail: true })).toBe(false);
    expect(isAnswered({ answered: false, voicemail: false })).toBe(false);
    expect(isAnswered({ answered: null })).toBe(false);

    const day = "2026-10-05T10:00:00-07:00";
    const calls: CallRailCall[] = [
      { id: "a", start_time: day, answered: true, voicemail: false, duration: 120, first_call: true, lead_status: "good_lead", source: "Google Ads", campaign: "Brand", keywords: "dentist near me" },
      { id: "b", start_time: day, answered: true, voicemail: false, duration: 30, first_call: false, lead_status: "not_a_lead", source: "Google Organic", source_name: "Website pool" },
      { id: "c", start_time: day, answered: false, voicemail: true, duration: 45, first_call: true, source: "Google Ads", campaign: "Brand" },
      { id: "d", start_time: day, answered: false, voicemail: false, duration: 5, tracking_phone_number: "+15555550100" },
      { id: "a", start_time: day, answered: true, duration: 120 }, // duplicate id across pages is ignored
    ];
    const rows = callsToRows(calls, { timeZone: "America/Los_Angeles", from: "2026-10-05", to: "2026-10-05" });
    const d = "2026-10-05";
    expect(pick(rows, "callrail.calls", d)).toBe(4);
    expect(pick(rows, "callrail.answered", d)).toBe(2);
    expect(pick(rows, "callrail.missed", d)).toBe(2);
    expect(pick(rows, "callrail.firstTimeCallers", d)).toBe(2);
    expect(pick(rows, "callrail.leads", d)).toBe(1);
    expect(pick(rows, "callrail.durationSeconds", d)).toBe(150); // answered calls only
    expect(pick(rows, "callrail.calls", d, "source", "Google Ads")).toBe(2);
    expect(pick(rows, "callrail.answered", d, "source", "Google Ads")).toBe(1);
    expect(pick(rows, "callrail.calls", d, "source", "(unknown)")).toBe(1);
    expect(pick(rows, "callrail.calls", d, "campaign", "Brand")).toBe(2);
    expect(pick(rows, "callrail.calls", d, "campaign", "Website pool")).toBe(1);
    expect(pick(rows, "callrail.calls", d, "campaign", "+15555550100")).toBe(1);
    expect(pick(rows, "callrail.calls", d, "keyword", "dentist near me")).toBe(1);
    expect(new Set(rows.filter((r) => r.dimension === "keyword").map((r) => r.dimensionValue))).toEqual(new Set(["dentist near me"]));
    expect(pick(rows, "callrail.voicemails", d)).toBe(1);
    expect(pick(rows, "callrail.missed", d, "source", "Google Ads")).toBe(1);
    expect(pick(rows, "callrail.calls", d, "weekday", "1 Mon")).toBe(4); // Oct 5 2026 is a Monday
    expect(pick(rows, "callrail.calls", d, "hour", "10:00")).toBe(4);
  });

  it("maps medium, landing page, city, tags and value, and builds call-log records", async () => {
    const { callsToRecords, localWeekdayHour, valueCents } = await import("./metrics");
    expect(valueCents("$1,250.00")).toBe(125000);
    expect(valueCents(null)).toBe(0);
    expect(localWeekdayHour("2026-10-05T07:30:00Z", "America/Los_Angeles")).toEqual({ weekday: "1 Mon", hour: "00:00" });
    expect(localWeekdayHour("2026-10-05T07:30:00Z", "America/New_York")).toEqual({ weekday: "1 Mon", hour: "03:00" });
    const calls: CallRailCall[] = [
      { id: "z1", start_time: "2026-10-06T14:05:00-07:00", answered: true, duration: 95, first_call: true, source: "Google Ads", medium: "cpc", landing_page_url: "https://www.example.com/implants/?gclid=abc", customer_city: "Austin", customer_state: "TX", customer_name: "Jane Doe", customer_phone_number: "+15125550100", tags: [{ name: "New patient" }], value: "300", recording_player: "https://app.callrail.com/calls/CAL1/recording?access_key=k", lead_status: "good_lead" },
      { id: "z2", start_time: "2026-10-06T15:00:00-07:00", answered: false, voicemail: true, recording_player: "https://evil.example.com/x" },
    ];
    const opts = { timeZone: "America/Los_Angeles", from: "2026-10-06", to: "2026-10-06" };
    const rows = callsToRows(calls, opts);
    const d = "2026-10-06";
    expect(pick(rows, "callrail.calls", d, "medium", "cpc")).toBe(1);
    expect(pick(rows, "callrail.calls", d, "landingPage", "example.com/implants")).toBe(1);
    expect(pick(rows, "callrail.calls", d, "city", "Austin, TX")).toBe(1);
    expect(pick(rows, "callrail.calls", d, "tag", "New patient")).toBe(1);
    expect(pick(rows, "callrail.value", d)).toBe(30000);
    expect(pick(rows, "callrail.calls", d, "weekday", "2 Tue")).toBe(2);
    const recs = callsToRecords(calls, opts);
    expect(recs).toHaveLength(2);
    expect(recs[0]).toMatchObject({ externalId: "z1", callerName: "Jane Doe", city: "Austin", state: "TX", answered: true, firstCall: true, durationSec: 95, leadStatus: "good_lead", tags: ["New patient"], landingPage: "example.com/implants", date: d });
    expect(recs[0].recordingUrl).toContain("app.callrail.com");
    expect(recs[1]).toMatchObject({ answered: false, voicemail: true, recordingUrl: null });
  });

  it("maps form submissions by source", () => {
    const rows = formsToRows(
      [{ id: "f1", submitted_at: "2026-10-05T09:00:00-07:00", source: "Facebook" }, { id: "f2", submitted_at: "2026-10-05T10:00:00-07:00" }],
      { timeZone: "America/Los_Angeles", from: "2026-10-05", to: "2026-10-05" },
    );
    expect(pick(rows, "callrail.forms", "2026-10-05")).toBe(2);
    expect(pick(rows, "callrail.forms", "2026-10-05", "source", "Facebook")).toBe(1);
  });
});

describe("pagination and rate limits", () => {
  it("follows relative pagination for calls and offset pagination for companies", async () => {
    const { fn, calls } = fakeFetch([
      (u) => {
        if (!u.pathname.endsWith("/calls.json")) return;
        if (!u.searchParams.get("after")) {
          return json({ has_next_page: true, next_page: `https://api.callrail.com/v3/a/ACC1/calls.json?after=p2&company_id=COM1`, calls: [{ id: "1", start_time: "2026-10-05T10:00:00-07:00", answered: true, duration: 10 }] });
        }
        return json({ has_next_page: false, next_page: null, calls: [{ id: "2", start_time: "2026-10-05T11:00:00-07:00", answered: false }] });
      },
      (u) => (u.pathname.endsWith("/form_submissions.json") ? new Response("", { status: 403 }) : undefined),
    ]);
    const ctx = {
      connection: { externalId: "ACC1" } as DataSourceConnection,
      asset: { externalId: "COM1", timezone: "America/Los_Angeles", settings: { accountId: "ACC1" } } as unknown as DataAsset,
      secret: KEY,
      from: "2026-10-05",
      to: "2026-10-05",
    };
    const rows = await fetchCallRailMetrics(ctx, { fetch: fn, sleep: noSleep, writeCalls: async () => {} });
    expect(pick(rows, "callrail.calls", "2026-10-05")).toBe(2);
    expect(pick(rows, "callrail.missed", "2026-10-05")).toBe(1);
    expect(rows.some((r) => r.metric === "callrail.forms")).toBe(false); // forms not enabled → skipped
    const first = calls[0].url;
    expect(first.pathname).toBe("/v3/a/ACC1/calls.json");
    expect(first.searchParams.get("company_id")).toBe("COM1");
    expect(first.searchParams.get("start_date")).toBe("2026-10-04");
    expect(first.searchParams.get("end_date")).toBe("2026-10-06");
    expect(first.searchParams.get("per_page")).toBe("250");
    expect(first.searchParams.get("relative_pagination")).toBe("true");
    expect(first.searchParams.get("fields")).toContain("first_call");
    expect(calls[1].url.searchParams.get("after")).toBe("p2");
    expect(calls.every((c) => c.auth === `Token token="${KEY}"`)).toBe(true);
  });

  it("pages companies across every account the key can see", async () => {
    const { fn } = fakeFetch([
      (u) => (u.pathname === "/v3/a.json" ? json({ page: 1, total_pages: 1, accounts: [{ id: "ACC1", name: "Agency" }, { id: "ACC2", name: "Other" }] }) : undefined),
      (u) => {
        if (u.pathname !== "/v3/a/ACC1/companies.json") return;
        const page = Number(u.searchParams.get("page") ?? "1");
        return json({ page, total_pages: 2, companies: [{ id: `COM${page}`, name: `Dental ${page}`, time_zone: "America/Chicago" }] });
      },
      (u) => (u.pathname === "/v3/a/ACC2/companies.json" ? json({ page: 1, total_pages: 1, companies: [{ id: "COM9", name: "Old", status: "disabled" }, { id: "COM10", name: "Law" }] }) : undefined),
    ]);
    const assets = await listCallRailAssets(KEY, { fetch: fn, sleep: noSleep });
    expect(assets).toEqual([
      { kind: "CALLRAIL_COMPANY", externalId: "COM1", name: "Dental 1", timezone: "America/Chicago", settings: { accountId: "ACC1" }, group: "Agency" },
      { kind: "CALLRAIL_COMPANY", externalId: "COM2", name: "Dental 2", timezone: "America/Chicago", settings: { accountId: "ACC1" }, group: "Agency" },
      { kind: "CALLRAIL_COMPANY", externalId: "COM10", name: "Law", timezone: undefined, settings: { accountId: "ACC2" }, group: "Other" },
    ]);
    expect((await listCallRailCompanies(KEY, "ACC1", { fetch: fn, sleep: noSleep })).map((c) => c.id)).toEqual(["COM1", "COM2"]);
  });

  it("retries 429s after Retry-After, then gives up with a safe error", async () => {
    let n = 0;
    const waits: number[] = [];
    const { fn } = fakeFetch([() => (++n < 3 ? new Response("", { status: 429, headers: { "retry-after": "7" } }) : json({ ok: true }))]);
    await expect(callrailGet(KEY, "https://api.callrail.com/v3/a.json", { fetch: fn, sleep: async (ms) => { waits.push(ms); } })).resolves.toEqual({ ok: true });
    expect(waits).toEqual([7000, 7000]);

    const always = fakeFetch([() => new Response("", { status: 429 })]);
    const err = await failure(callrailGet(KEY, "https://api.callrail.com/v3/a.json", { fetch: always.fn, sleep: noSleep }));
    expect(err).toBeInstanceOf(CallRailError);
    expect(err.status).toBe(429);
    expect(always.calls.length).toBe(5);
  });

  it("never sends the key to a non-CallRail host from a pagination link", async () => {
    const { fn, calls } = fakeFetch([(u) => (u.host === "api.callrail.com" ? json({ has_next_page: true, next_page: "https://evil.example.com/steal", calls: [] }) : json({}))]);
    await expect(fetchCallRailMetrics({ connection: { externalId: "A" } as DataSourceConnection, asset: { externalId: "C", timezone: null, settings: null } as unknown as DataAsset, secret: KEY, from: "2026-10-01", to: "2026-10-01" }, { fetch: fn, sleep: noSleep, writeCalls: async () => {} })).rejects.toThrow(CallRailError);
    expect(calls.every((c) => c.url.host === "api.callrail.com")).toBe(true);
  });
});

describe("key validation", () => {
  it("returns the first account for a valid key", async () => {
    const { fn, calls } = fakeFetch([(u) => (u.pathname === "/v3/a.json" ? json({ page: 1, total_pages: 1, accounts: [{ id: "ACC1", name: "Smile Agency" }] }) : undefined)]);
    expect(await validateCallRailKey(`  ${KEY}  `, { fetch: fn })).toEqual({ accountId: "ACC1", accountName: "Smile Agency", accounts: [{ id: "ACC1", name: "Smile Agency" }] });
    expect(calls[0].auth).toBe(`Token token="${KEY}"`);
  });

  it("rejects malformed keys without calling CallRail", async () => {
    const { fn, calls } = fakeFetch([]);
    for (const bad of ["", "   ", 'abc" injected', "a\r\nX-Evil: 1", null, "x".repeat(300)]) {
      await expect(validateCallRailKey(bad, { fetch: fn })).rejects.toThrow(CallRailError);
    }
    expect(calls).toHaveLength(0);
  });

  it.each([
    [401, /didn't accept that API key/],
    [403, /didn't accept that API key/],
    [500, /CallRail API error \(500\)/],
  ])("maps HTTP %s to a friendly error that doesn't contain the key", async (status, msg) => {
    const { fn } = fakeFetch([() => new Response("", { status })]);
    const err = await failure(validateCallRailKey(KEY, { fetch: fn, sleep: noSleep }));
    expect(err).toBeInstanceOf(CallRailError);
    expect(err.message).toMatch(msg);
    expect(err.message).not.toContain(KEY);
  });

  it("handles network failures and keys with no accounts", async () => {
    const down = (async () => { throw new TypeError("fetch failed"); }) as typeof fetch;
    const e1 = await failure(validateCallRailKey(KEY, { fetch: down, sleep: noSleep }));
    expect(e1.message).toMatch(/Couldn't reach CallRail/);
    const { fn } = fakeFetch([() => json({ page: 1, total_pages: 1, accounts: [] })]);
    await expect(validateCallRailKey(KEY, { fetch: fn })).rejects.toThrow(/can't see any CallRail accounts/);
  });
});
