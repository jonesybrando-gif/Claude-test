"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import type { Platform } from "@prisma/client";
import { formatMoney, formatNumber } from "@/lib/money";
import { PlatformLabel } from "@/components/platform-badge";
import { Input } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export interface CampaignRowData {
  id: string;
  name: string;
  platform: Platform;
  status: string;
  costMinor: number;
  clicks: number;
  conversions: number;
  conversionValueMinor: number;
}

type Key = "name" | "costMinor" | "clicks" | "conversions" | "cpa" | "roas";

const cpa = (r: CampaignRowData) => (r.conversions > 0 ? r.costMinor / r.conversions : null);
const roas = (r: CampaignRowData) => (r.conversionValueMinor > 0 && r.costMinor > 0 ? r.conversionValueMinor / r.costMinor : null);
/** Whole numbers once there are enough to count; one decimal below 100 (platforms report fractional conversions). */
const conv = (n: number) => formatNumber(n, n < 100 ? 1 : 0);

/**
 * Campaigns for the period: biggest spend first, campaigns with no spend
 * folded away, sortable columns, a search box and a totals row.
 */
export function CampaignTable({ rows, currency }: { rows: CampaignRowData[]; currency: string }) {
  const [q, setQ] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [sort, setSort] = useState<{ key: Key; dir: 1 | -1 }>({ key: "costMinor", dir: -1 });

  const value = (r: CampaignRowData, k: Key) => (k === "cpa" ? cpa(r) : k === "roas" ? roas(r) : r[k]);
  const matching = rows.filter((r) => !q || r.name.toLowerCase().includes(q.toLowerCase()));
  const active = matching.filter((r) => r.costMinor > 0 || r.clicks > 0 || r.conversions > 0);
  const inactive = matching.length - active.length;
  const visible = useMemo(() => {
    const list = showInactive ? matching : active;
    return [...list].sort((a, b) => {
      const x = value(a, sort.key);
      const y = value(b, sort.key);
      if (typeof x === "string" || typeof y === "string") return String(x).localeCompare(String(y)) * sort.dir;
      if (x === null) return 1;
      if (y === null) return -1;
      return (x - y) * sort.dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, q, showInactive, sort]);
  const total = active.reduce((t, r) => ({ costMinor: t.costMinor + r.costMinor, clicks: t.clicks + r.clicks, conversions: t.conversions + r.conversions, conversionValueMinor: t.conversionValueMinor + r.conversionValueMinor }), { costMinor: 0, clicks: 0, conversions: 0, conversionValueMinor: 0 });
  const totalRow = { ...total, id: "", name: "", platform: "GOOGLE_ADS" as Platform, status: "" };

  const head = (k: Key, label: string, className = "text-right") => (
    <TH className={className} aria-sort={sort.key === k ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button type="button" className="inline-flex cursor-pointer items-center gap-1 hover:text-text" onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? ((-s.dir) as 1 | -1) : k === "name" ? 1 : -1 }))}>
        {label}
        {sort.key === k && (sort.dir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </button>
    </TH>
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 px-5 pb-3">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search campaigns…" className="w-full sm:w-64" aria-label="Search campaigns" />
        <span className="text-xs text-text-3">{active.length} with activity{inactive > 0 && <> · {inactive} with no spend</>}</span>
        {inactive > 0 && (
          <button type="button" className="text-xs font-medium text-brand hover:underline" onClick={() => setShowInactive((v) => !v)}>
            {showInactive ? "Hide campaigns with no spend" : `Show ${inactive} with no spend`}
          </button>
        )}
      </div>
      <Table>
        <THead>
          <tr>
            {head("name", "Campaign", "pl-5")}
            <TH>Platform</TH>
            <TH>Status</TH>
            {head("costMinor", "Spend")}
            {head("clicks", "Clicks")}
            {head("conversions", "Conv.")}
            {head("cpa", "Cost / conv.")}
            {head("roas", "ROAS", "pr-5 text-right")}
          </tr>
        </THead>
        <TBody>
          {visible.map((r) => (
            <TR key={r.id} className={r.costMinor === 0 && r.clicks === 0 ? "text-text-3" : undefined}>
              <TD className="pl-5 font-medium">{r.name}</TD>
              <TD className="text-xs"><PlatformLabel platform={r.platform} /></TD>
              <TD className="text-xs text-text-2">{r.status.toLowerCase()}</TD>
              <TD className="text-right">{formatMoney(r.costMinor, currency, { whole: true })}</TD>
              <TD className="text-right">{formatNumber(r.clicks)}</TD>
              <TD className="text-right">{conv(r.conversions)}</TD>
              <TD className="text-right">{cpa(r) === null ? "—" : formatMoney(cpa(r)!, currency)}</TD>
              <TD className="pr-5 text-right">{roas(r) === null ? "—" : `${roas(r)!.toFixed(2)}×`}</TD>
            </TR>
          ))}
          {visible.length === 0 && (
            <tr><td colSpan={8} className="px-5 py-8 text-center text-sm text-text-3">{rows.length === 0 ? "No campaigns yet. They appear after the first sync." : "No campaigns match."}</td></tr>
          )}
          {active.length > 1 && !q && (
            <TR className="border-t-2 border-border font-medium">
              <TD className="pl-5">Total ({active.length} campaigns)</TD>
              <TD />
              <TD />
              <TD className="text-right">{formatMoney(total.costMinor, currency, { whole: true })}</TD>
              <TD className="text-right">{formatNumber(total.clicks)}</TD>
              <TD className="text-right">{conv(total.conversions)}</TD>
              <TD className="text-right">{cpa(totalRow) === null ? "—" : formatMoney(cpa(totalRow)!, currency)}</TD>
              <TD className="pr-5 text-right">{roas(totalRow) === null ? "—" : `${roas(totalRow)!.toFixed(2)}×`}</TD>
            </TR>
          )}
        </TBody>
      </Table>
    </div>
  );
}
