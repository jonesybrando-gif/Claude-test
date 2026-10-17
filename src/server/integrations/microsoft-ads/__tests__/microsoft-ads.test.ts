import { describe, expect, it } from "vitest";
import { deflateRawSync } from "node:zlib";
import { campaignReportRequest, classifyMicrosoftError, createMicrosoftAdsAdapter, parseCampaignReport, parseReportDate } from "../adapter";
import { unzipEntries } from "../zip";
import { parseCsv } from "../csv";
import { microsoftTimeZoneToIana } from "../timezones";

const config = { clientId: "cid", clientSecret: "sec", developerToken: "dev", tenant: "common" };

/** Builds a one-file ZIP (deflate) the way report downloads arrive. */
function makeZip(name: string, content: string): Buffer {
  const data = Buffer.from(content);
  const comp = deflateRawSync(data);
  const nameBuf = Buffer.from(name);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(comp.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(comp.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(nameBuf.length, 28);
  central.writeUInt32LE(0, 42);
  const cdOffset = local.length + nameBuf.length + comp.length;
  const cd = Buffer.concat([central, nameBuf]);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(cdOffset, 16);
  return Buffer.concat([local, nameBuf, comp, cd, eocd]);
}

const CSV = '﻿"TimePeriod","AccountId","CampaignId","CampaignName","CampaignStatus","CurrencyCode","Spend","Impressions","Clicks","Conversions","Revenue"\r\n' +
  '"2026-10-15","111","9001","Roof Repair, Exact","Active","USD","123.455","1,200","48","3.00","900.10"\r\n' +
  '"2026-10-16","111","9001","Roof Repair, Exact","Active","USD","0.00","0","0","0.00","0.00"\r\n' +
  '"2026-10-16","111","9002","Brand ""Quotes""","Paused","USD","5.10","80","4","0","0"\r\n' +
  '"©2026 Microsoft Corporation. All rights reserved. "\r\n';

describe("Microsoft report parsing", () => {
  it("unzips a deflated report", () => {
    const [entry] = unzipEntries(makeZip("report.csv", "a,b\n1,2\n"));
    expect(entry.name).toBe("report.csv");
    expect(entry.data.toString()).toBe("a,b\n1,2\n");
    expect(() => unzipEntries(Buffer.from("not a zip at all, definitely not"))).toThrow();
  });

  it("parses quoted CSV and skips footer lines", () => {
    const records = parseCsv(CSV);
    expect(records[0].CampaignName).toBe("Roof Repair, Exact");
    expect(records[2].CampaignName).toBe('Brand "Quotes"');
    const { rows, campaigns } = parseCampaignReport(records);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({ campaignExternalId: "9001", date: "2026-10-15", costMinor: 12346, costIsEstimated: false, impressions: 1200, clicks: 48, conversions: 3, conversionValueMinor: 90010 });
    expect(campaigns.find((c) => c.externalId === "9002")!.status).toBe("PAUSED");
  });

  it("accepts both date formats", () => {
    expect(parseReportDate("2026-10-05")).toBe("2026-10-05");
    expect(parseReportDate("10/5/2026")).toBe("2026-10-05");
    expect(parseReportDate("©2026 Microsoft")).toBeNull();
  });

  it("maps time zones", () => {
    expect(microsoftTimeZoneToIana("EasternTimeUSCanada")).toBe("America/New_York");
    expect(microsoftTimeZoneToIana("PacificTimeUSCanadaTijuana")).toBe("America/Los_Angeles");
    expect(microsoftTimeZoneToIana("SomethingNew")).toBeNull();
  });

  it("builds a daily campaign report request", () => {
    const r = campaignReportRequest("111", "2026-09-28", "2026-10-03").ReportRequest;
    expect(r.Type).toBe("CampaignPerformanceReportRequest");
    expect(r.Aggregation).toBe("Daily");
    expect(r.Scope.AccountIds).toEqual([111]);
    expect(r.Time.CustomDateRangeStart).toEqual({ Day: 28, Month: 9, Year: 2026 });
    expect(r.Time.CustomDateRangeEnd).toEqual({ Day: 3, Month: 10, Year: 2026 });
  });
});

describe("Microsoft error classification", () => {
  it("maps known error codes and HTTP statuses", () => {
    const fault = (code: string) => ({ Errors: [{ Code: 109, ErrorCode: code, Message: "detail" }] });
    const expired = classifyMicrosoftError(400, fault("AuthenticationTokenExpired"));
    expect(expired.kind).toBe("AUTH_REVOKED");
    expect(expired.status).toBe(401); // triggers one refresh-and-retry
    expect(classifyMicrosoftError(400, fault("UserIsNotAuthorized")).kind).toBe("PERMISSION_DENIED");
    expect(classifyMicrosoftError(400, fault("CallRateExceeded")).kind).toBe("RATE_LIMITED");
    expect(classifyMicrosoftError(400, fault("InvalidDeveloperToken")).kind).toBe("NOT_APPROVED");
    expect(classifyMicrosoftError(503, "").kind).toBe("TRANSIENT");
    expect(classifyMicrosoftError(400, { Errors: [{ ErrorCode: "SomethingElse", Message: "bad" }] }).message).toBe("bad");
  });
});

describe("Microsoft adapter (mocked HTTP)", () => {
  it("builds the Microsoft identity consent URL", () => {
    const url = new URL(createMicrosoftAdsAdapter({ config }).authorizationUrl("st", "https://app/cb"));
    expect(url.origin + url.pathname).toBe("https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
    expect(url.searchParams.get("scope")).toBe("https://ads.microsoft.com/msads.manage offline_access");
  });

  it("keeps the rotated refresh token", async () => {
    const fn = async () => new Response(JSON.stringify({ access_token: "A2", refresh_token: "R2", expires_in: 3600 }), { status: 200 });
    const t = await createMicrosoftAdsAdapter({ config, fetch: fn }).refresh!("R1");
    expect(t).toMatchObject({ accessToken: "A2", refreshToken: "R2" });
  });

  it("lists accounts for the signed-in user", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fn = async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.endsWith("/User/Query")) return new Response(JSON.stringify({ User: { Id: 42 }, CustomerRoles: [] }));
      return new Response(JSON.stringify({ Accounts: [
        { Id: 111, Name: "Roofing Co.", Number: "B0123", CurrencyCode: "USD", TimeZone: "CentralTimeUSCanada", AccountLifeCycleStatus: "Active", ParentCustomerId: 999 },
        { Id: 112, Name: "Old Client", Number: "B0124", CurrencyCode: "CAD", TimeZone: "Mars", AccountLifeCycleStatus: "Inactive", ParentCustomerId: 999 },
      ] }));
    };
    const accounts = await createMicrosoftAdsAdapter({ config, fetch: fn }).listAccounts("TOK");
    expect(accounts[1]).toMatchObject({ externalId: "111", displayId: "B0123", timezone: "America/Chicago", loginCustomerId: "999", statusNote: undefined });
    expect(accounts[0].statusNote).toContain("Inactive");
    expect(accounts[0].statusNote).toContain("not mapped");
    const h = calls[0].init!.headers as Record<string, string>;
    expect(h.Authorization).toBe("Bearer TOK");
    expect(h.DeveloperToken).toBe("dev");
    expect(JSON.parse(String(calls[1].init!.body)).Predicates[0]).toEqual({ Field: "UserId", Operator: "Equals", Value: "42" });
  });

  it("submits, polls and downloads the report", async () => {
    let polls = 0;
    const seen: string[] = [];
    const fn = async (url: string, init?: RequestInit) => {
      seen.push(url);
      if (url.endsWith("/GenerateReport/Submit")) {
        const h = init!.headers as Record<string, string>;
        expect(h.CustomerId).toBe("999");
        expect(h.CustomerAccountId).toBe("111");
        return new Response(JSON.stringify({ ReportRequestId: "req-1" }));
      }
      if (url.endsWith("/GenerateReport/Poll")) {
        polls++;
        return new Response(JSON.stringify({ ReportRequestStatus: polls < 3 ? { Status: "Pending" } : { Status: "Success", ReportDownloadUrl: "https://bingadsappsstorageprod.blob.core.windows.net/r/report.zip?sig=x" } }));
      }
      return new Response(new Uint8Array(makeZip("report.csv", CSV)));
    };
    const sleeps: number[] = [];
    const a = createMicrosoftAdsAdapter({ config, fetch: fn, sleep: async (ms) => void sleeps.push(ms), pollIntervalMs: 10 });
    const r = await a.fetchDailyPerformance("TOK", { externalId: "111", loginCustomerId: "999" }, "2026-10-15", "2026-10-16");
    expect(polls).toBe(3);
    expect(sleeps).toEqual([10, 10]);
    expect(r.rows.reduce((s, x) => s + x.costMinor, 0)).toBe(12346 + 510);
  });

  it("returns no rows when the report has no data", async () => {
    const fn = async (url: string) =>
      new Response(JSON.stringify(url.endsWith("/Submit") ? { ReportRequestId: "r" } : { ReportRequestStatus: { Status: "Success", ReportDownloadUrl: null } }));
    const r = await createMicrosoftAdsAdapter({ config, fetch: fn, sleep: async () => {} }).fetchDailyPerformance("T", { externalId: "1" }, "2026-10-01", "2026-10-02");
    expect(r.rows).toEqual([]);
  });

  it("refuses unexpected download hosts", async () => {
    const fn = async (url: string) =>
      new Response(JSON.stringify(url.endsWith("/Submit") ? { ReportRequestId: "r" } : { ReportRequestStatus: { Status: "Success", ReportDownloadUrl: "https://evil.example.com/x.zip" } }));
    await expect(createMicrosoftAdsAdapter({ config, fetch: fn, sleep: async () => {} }).fetchDailyPerformance("T", { externalId: "1" }, "2026-10-01", "2026-10-02")).rejects.toMatchObject({ kind: "INVALID_REQUEST" });
  });

  it("treats a fault inside an HTTP 200 as an error", async () => {
    const fn = async () => new Response(JSON.stringify({ Errors: [{ ErrorCode: "AuthenticationTokenExpired", Message: "expired" }] }), { status: 200 });
    await expect(createMicrosoftAdsAdapter({ config, fetch: fn }).listAccounts("T")).rejects.toMatchObject({ kind: "AUTH_REVOKED", status: 401 });
  });
});

describe("Microsoft code exchange", () => {
  it("reports a bad sign-in code as such, not as revoked access", async () => {
    const fn = async () => new Response(JSON.stringify({ error: "invalid_grant", error_description: "AADSTS9002313: Invalid request." }), { status: 400 });
    const a = createMicrosoftAdsAdapter({ config, fetch: fn });
    await expect(a.exchangeCode("bad", "https://app/cb")).rejects.toMatchObject({ kind: "INVALID_REQUEST" });
    await expect(a.refresh!("r")).rejects.toMatchObject({ kind: "AUTH_REVOKED" });
  });
});
