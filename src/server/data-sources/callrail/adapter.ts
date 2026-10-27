import "server-only";
import { addDays, type IsoDate } from "@/lib/pacing/dates";
import type { DataSourceAdapter, MetricRow, RemoteAsset, SyncContext } from "../types";
import { CALLRAIL_API, CallRailError, callrailList, listCallRailAccounts, listCallRailCompanies, type CallRailClientOptions } from "./client";
import { callsToRecords, callsToRows, formsToRecords, formsToRows, type CallRailCall, type CallRailFormSubmission, type CallRecordRow, type FormRecordRow } from "./metrics";

// CallRail (API key). One DataAsset per CallRail company (CALLRAIL_COMPANY);
// settings.accountId holds the owning account. Requests run sequentially and
// retry 429s per Retry-After (see ./client.ts).

// Defaults already include answered, voicemail, duration, start_time, customer_* and recording_player.
const CALL_FIELDS = ["first_call", "source", "source_name", "keywords", "campaign", "lead_status", "company_time_zone", "medium", "landing_page_url", "tags", "value"].join(",");

/** Call-log storage, injectable for tests. Replaces the asset's calls for the window's dates. */
export type CallRecordWriter = (assetId: string, clientId: string, from: IsoDate, to: IsoDate, records: CallRecordRow[]) => Promise<void>;

const RETAIN_DAYS = 400;

/** Form-log storage, injectable for tests. Replaces the asset's submissions for the window's dates. */
export type FormRecordWriter = (assetId: string, clientId: string, from: IsoDate, to: IsoDate, records: FormRecordRow[]) => Promise<void>;

export const writeFormRecords: FormRecordWriter = async (assetId, clientId, from, to, records) => {
  const { prisma } = await import("../../db");
  const day = (d: IsoDate) => new Date(`${d}T00:00:00.000Z`);
  await prisma.$transaction([
    prisma.formRecord.deleteMany({ where: { assetId, OR: [{ date: { gte: day(from), lte: day(to) } }, { date: { lt: day(addDays(to, -RETAIN_DAYS)) } }] } }),
    prisma.formRecord.createMany({ data: records.map((r) => ({ ...r, assetId, clientId, date: day(r.date) })), skipDuplicates: true }),
  ]);
};

export const writeCallRecords: CallRecordWriter = async (assetId, clientId, from, to, records) => {
  const { prisma } = await import("../../db");
  const day = (d: IsoDate) => new Date(`${d}T00:00:00.000Z`);
  await prisma.$transaction([
    prisma.callRecord.deleteMany({ where: { assetId, OR: [{ date: { gte: day(from), lte: day(to) } }, { date: { lt: day(addDays(to, -RETAIN_DAYS)) } }] } }),
    prisma.callRecord.createMany({ data: records.map((r) => ({ ...r, assetId, clientId, date: day(r.date) })), skipDuplicates: true }),
  ]);
};

function requireKey(secret: string | undefined): string {
  if (!secret) throw new CallRailError("No CallRail API key is stored for this connection. Paste a key in Settings › Connections.", 401);
  return secret;
}

function accountIdFor(ctx: SyncContext): string {
  const s = ctx.asset.settings as { accountId?: unknown } | null;
  const id = typeof s?.accountId === "string" && s.accountId ? s.accountId : ctx.connection.externalId;
  if (!id) throw new CallRailError("This CallRail company has no account id; re-link it from “Choose companies”.");
  return id;
}

function timeZoneFor(ctx: SyncContext): string | null {
  const s = ctx.asset.settings as { timeZone?: unknown } | null;
  return ctx.asset.timezone ?? (typeof s?.timeZone === "string" ? s.timeZone : null);
}

function listUrl(accountId: string, resource: string, params: Record<string, string>): string {
  const u = new URL(`${CALLRAIL_API}/a/${encodeURIComponent(accountId)}/${resource}.json`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}

/** Calls for one company. The window is padded a day each side so time-zone edges are covered; rows are bucketed and clipped locally. */
export async function fetchCallRailCalls(key: string, accountId: string, companyId: string, from: IsoDate, to: IsoDate, opts?: CallRailClientOptions): Promise<CallRailCall[]> {
  const url = listUrl(accountId, "calls", {
    company_id: companyId,
    start_date: addDays(from, -1),
    end_date: addDays(to, 1),
    fields: CALL_FIELDS,
    per_page: "250",
    relative_pagination: "true",
  });
  return callrailList<CallRailCall>(key, url, "calls", opts);
}

export async function fetchCallRailForms(key: string, accountId: string, companyId: string, from: IsoDate, to: IsoDate, opts?: CallRailClientOptions): Promise<CallRailFormSubmission[]> {
  const url = listUrl(accountId, "form_submissions", {
    company_id: companyId,
    start_date: addDays(from, -1),
    end_date: addDays(to, 1),
    fields: "source,form_url,referrer,referring_url,first_form,formatted_customer_name,lead_status,value",
    per_page: "250",
  });
  return callrailList<CallRailFormSubmission>(key, url, "form_submissions", opts);
}

export async function fetchCallRailMetrics(ctx: SyncContext, opts?: CallRailClientOptions & { writeCalls?: CallRecordWriter; writeForms?: FormRecordWriter }): Promise<MetricRow[]> {
  const key = requireKey(ctx.secret);
  const accountId = accountIdFor(ctx);
  const companyId = ctx.asset.externalId;
  const calls = await fetchCallRailCalls(key, accountId, companyId, ctx.from, ctx.to, opts);
  const timeZone = timeZoneFor(ctx) ?? calls.find((c) => c.company_time_zone)?.company_time_zone ?? null;
  const rows = callsToRows(calls, { timeZone, from: ctx.from, to: ctx.to });
  await (opts?.writeCalls ?? writeCallRecords)(ctx.asset.id, ctx.asset.clientId, ctx.from, ctx.to, callsToRecords(calls, { timeZone, from: ctx.from, to: ctx.to }));
  // Form tracking is an optional CallRail add-on: skip quietly when the account doesn't have it.
  try {
    const forms = await fetchCallRailForms(key, accountId, companyId, ctx.from, ctx.to, opts);
    rows.push(...formsToRows(forms, { timeZone, from: ctx.from, to: ctx.to }));
    await (opts?.writeForms ?? writeFormRecords)(ctx.asset.id, ctx.asset.clientId, ctx.from, ctx.to, formsToRecords(forms, { timeZone, from: ctx.from, to: ctx.to }));
  } catch (e) {
    if (!(e instanceof CallRailError) || (e.status !== 400 && e.status !== 403 && e.status !== 404)) throw e;
  }
  return rows;
}

export async function listCallRailAssets(key: string, opts?: CallRailClientOptions): Promise<RemoteAsset[]> {
  const out: RemoteAsset[] = [];
  for (const account of await listCallRailAccounts(key, opts)) {
    for (const c of await listCallRailCompanies(key, account.id, opts)) {
      if (c.status && c.status.toLowerCase() === "disabled") continue;
      out.push({
        kind: "CALLRAIL_COMPANY",
        externalId: c.id,
        name: c.name,
        timezone: c.time_zone ?? undefined,
        settings: { accountId: account.id },
        group: account.name,
      });
    }
  }
  return out;
}

export const callrailAdapter: DataSourceAdapter = {
  provider: "CALLRAIL",
  kinds: ["CALLRAIL_COMPANY"],
  listAssets: ({ secret }) => listCallRailAssets(requireKey(secret)),
  fetchMetrics: (ctx) => fetchCallRailMetrics(ctx),
  refetchDays: 3,
  backfillDays: 395,
};
