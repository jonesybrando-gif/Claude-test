"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Info } from "lucide-react";
import type { PlatformKey } from "@/lib/platforms";
import { STATUS_SEVERITY, type PacingStatus } from "@/lib/pacing/status";
import { formatMoney, formatNumber, formatPct } from "@/lib/money";
import { relativeTime } from "@/lib/time";
import { Input, Select } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { LabelBadge, type LabelInfo } from "@/components/label-badge";
import { PlatformLabel } from "@/components/platform-badge";
import { NoBudgetBadge, NotConnectedBadge, StaleBadge, StatusBadge } from "@/components/status-badge";
import { Sparkline } from "@/components/kpi/sparkline";

export interface PortfolioRow {
  id: string;
  name: string;
  href: string;
  labels: LabelInfo[];
  owner: string | null;
  platforms: PlatformKey[];
  currency: string;
  spendMinor: number;
  spendChangePct: number | null;
  conversions: number;
  conversionsChangePct: number | null;
  costPerConversionMinor: number | null;
  /** Pacing for the current budget period: a status, or why there is none. */
  pacing: PacingStatus | "NOT_CONNECTED" | "NO_BUDGET";
  attention: boolean;
  dailySpend: number[];
  lastSyncAt: string | null;
  stale: boolean;
  isDemo: boolean;
}

type SortKey = "name" | "spend" | "spendChange" | "conversions" | "cpa" | "pacing" | "sync";

const pacingRank = (r: PortfolioRow) => (r.pacing === "NOT_CONNECTED" ? -2 : r.pacing === "NO_BUDGET" ? -1 : STATUS_SEVERITY[r.pacing]);

const SORTERS: Record<SortKey, (a: PortfolioRow, b: PortfolioRow) => number> = {
  name: (a, b) => a.name.localeCompare(b.name),
  spend: (a, b) => a.spendMinor - b.spendMinor,
  spendChange: (a, b) => (a.spendChangePct ?? -Infinity) - (b.spendChangePct ?? -Infinity),
  conversions: (a, b) => a.conversions - b.conversions,
  cpa: (a, b) => (a.costPerConversionMinor ?? Infinity) - (b.costPerConversionMinor ?? Infinity),
  pacing: (a, b) => pacingRank(a) - pacingRank(b),
  sync: (a, b) => (a.lastSyncAt ?? "").localeCompare(b.lastSyncAt ?? ""),
};

function Change({ pct, better }: { pct: number | null; better: "up" | "down" | "neutral" }) {
  if (pct === null) return <div className="text-[11px] text-text-3">—</div>;
  const flat = Math.abs(pct) < 0.5;
  const tone = flat || better === "neutral" ? "text-text-3" : (pct > 0) === (better === "up") ? "text-good-ink" : "text-critical-ink";
  return <div className={`text-[11px] ${tone}`}>{flat ? "0%" : `${pct > 0 ? "+" : "−"}${formatPct(Math.abs(pct), 0)}`}</div>;
}

/**
 * Every client on one sortable, filterable table: spend, change, results,
 * pacing, a spend trend and data freshness. A row opens the client.
 */
export function PortfolioTable({ rows, labels, rangeQuery, periodLabel }: { rows: PortfolioRow[]; labels: LabelInfo[]; rangeQuery: string; periodLabel: string }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [label, setLabel] = useState("");
  const [owner, setOwner] = useState("");
  const [onlyAttention, setOnlyAttention] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "spend", dir: -1 });
  const owners = useMemo(() => [...new Set(rows.map((r) => r.owner).filter((o): o is string => !!o))].sort(), [rows]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows
      .filter((r) => {
        if (needle && !r.name.toLowerCase().includes(needle)) return false;
        if (label === "none" && r.labels.length > 0) return false;
        if (label && label !== "none" && !r.labels.some((l) => l.id === label)) return false;
        if (owner === "none" && r.owner) return false;
        if (owner && owner !== "none" && r.owner !== owner) return false;
        if (onlyAttention && !r.attention) return false;
        return true;
      })
      .sort((a, b) => SORTERS[sort.key](a, b) * sort.dir || a.name.localeCompare(b.name));
  }, [rows, q, label, owner, onlyAttention, sort]);

  const head = (key: SortKey, text: string, className = "") => (
    <TH className={className} aria-sort={sort.key === key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button type="button" className="inline-flex items-center gap-1 hover:text-text cursor-pointer" onClick={() => setSort((s) => ({ key, dir: s.key === key ? ((-s.dir) as 1 | -1) : key === "name" ? 1 : -1 }))}>
        {text}
        {sort.key === key && (sort.dir === 1 ? <ArrowUp className="h-3 w-3" aria-hidden /> : <ArrowDown className="h-3 w-3" aria-hidden />)}
      </button>
    </TH>
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 px-5 pb-3">
        <Input placeholder="Search clients…" value={q} onChange={(e) => setQ(e.target.value)} className="w-full sm:w-52" aria-label="Search clients" />
        {labels.length > 0 && (
          <Select value={label} onChange={(e) => setLabel(e.target.value)} className="w-full sm:w-40" aria-label="Label">
            <option value="">All labels</option>
            {labels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            <option value="none">No label</option>
          </Select>
        )}
        {owners.length > 0 && (
          <Select value={owner} onChange={(e) => setOwner(e.target.value)} className="w-full sm:w-44" aria-label="Account manager">
            <option value="">All managers</option>
            {owners.map((o) => <option key={o} value={o}>{o}</option>)}
            <option value="none">Unassigned</option>
          </Select>
        )}
        <label className="flex items-center gap-2 text-sm text-text-2">
          <input type="checkbox" checked={onlyAttention} onChange={(e) => setOnlyAttention(e.target.checked)} className="h-4 w-4 accent-[var(--brand)]" />
          Needs attention
        </label>
        <span className="ml-auto text-xs text-text-3">{visible.length} of {rows.length} clients · {periodLabel}</span>
      </div>
      <Table className="min-w-[980px]">
        <THead>
          <tr>
            {head("name", "Client", "pl-5")}
            <TH>Platforms</TH>
            {head("spend", "Spend", "text-right")}
            {head("conversions", "Conversions", "text-right")}
            {head("cpa", "Cost / conv.", "text-right")}
            {head("pacing", "Pacing this month")}
            <TH>Daily spend</TH>
            {head("sync", "Last sync", "pr-5")}
          </tr>
        </THead>
        <TBody>
          {visible.map((r) => (
            <TR key={r.id} className="cursor-pointer" onClick={(e) => { if (!(e.target as HTMLElement).closest("a,button")) router.push(r.href); }}>
              <TD className="pl-5">
                <Link href={r.href} className="font-medium text-text hover:underline">{r.name}</Link>
                <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-text-3">
                  {r.owner ?? "Unassigned"}
                  {r.labels.map((l) => <LabelBadge key={l.id} label={l} />)}
                  {r.isDemo && <span className="text-info-ink">· demo data</span>}
                </div>
              </TD>
              <TD className="text-xs">
                <div className="flex flex-wrap gap-2">{r.platforms.length ? r.platforms.map((p) => <PlatformLabel key={p} platform={p} />) : <span className="text-text-3">None linked</span>}</div>
              </TD>
              <TD className="text-right">
                <div className="font-medium">{formatMoney(r.spendMinor, r.currency, { whole: true })}</div>
                <Change pct={r.spendChangePct} better="neutral" />
              </TD>
              <TD className="text-right">
                <div>{formatNumber(r.conversions, 0)}</div>
                <Change pct={r.conversionsChangePct} better="up" />
              </TD>
              <TD className="text-right">{r.costPerConversionMinor === null ? "—" : formatMoney(r.costPerConversionMinor, r.currency)}</TD>
              <TD>
                {r.pacing === "NOT_CONNECTED" ? <NotConnectedBadge /> : r.pacing === "NO_BUDGET" ? <NoBudgetBadge /> : <StatusBadge status={r.pacing} />}
              </TD>
              <TD><Sparkline values={r.dailySpend} width={96} height={24} /></TD>
              <TD className="pr-5 text-xs text-text-2">
                {r.platforms.length === 0 ? <span className="text-text-3">—</span> : r.stale ? <StaleBadge label={r.lastSyncAt ? relativeTime(r.lastSyncAt) : "Never synced"} /> : relativeTime(r.lastSyncAt)}
              </TD>
            </TR>
          ))}
          {visible.length === 0 && (
            <tr>
              <td colSpan={8} className="px-5 py-10 text-center text-sm text-text-3">
                <Info className="mx-auto mb-2 h-5 w-5" aria-hidden /> No clients match these filters.
              </td>
            </tr>
          )}
        </TBody>
      </Table>
      <p className="px-5 pt-3 pb-4 text-xs text-text-3">
        Spend and conversions cover the selected range; changes compare with the comparison period. Pacing is for the current budget period. <Link href={`/performance?client=all&${rangeQuery}`} className="text-brand hover:underline">View all clients combined</Link>
      </p>
    </div>
  );
}
