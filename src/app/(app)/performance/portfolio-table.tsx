"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Info } from "lucide-react";
import type { PlatformKey } from "@/lib/platforms";
import { STATUS_SEVERITY, type PacingStatus } from "@/lib/pacing/status";
import type { AttentionReason, ChangeWords } from "@/lib/portfolio";
import { formatMoney, formatNumber } from "@/lib/money";
import { relativeTime } from "@/lib/time";
import { Input, Select } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
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
  /** Change in cost per conversion vs the comparison period, in words. */
  costPerConversionChange: ChangeWords | null;
  /** Pacing for the current budget period (worse of to-date and forecast), or why there is none. */
  pacing: PacingStatus | "NOT_CONNECTED" | "NO_BUDGET";
  /** Needs-attention reasons, the same as on Home. */
  reasons: AttentionReason[];
  attentionWeight: number;
  attention: boolean;
  dailySpend: number[];
  lastSyncAt: string | null;
  stale: boolean;
  isDemo: boolean;
}

export interface PortfolioTotals {
  label: string;
  currency: string;
  spend: string;
  spendChange: ChangeWords | null;
  conversions: string;
  conversionsChange: ChangeWords | null;
  cpa: string;
  cpaChange: ChangeWords | null;
  attention: number;
}

type SortKey = "attention" | "name" | "spend" | "spendChange" | "conversions" | "cpa" | "pacing" | "sync";

const pacingRank = (r: PortfolioRow) => (r.pacing === "NOT_CONNECTED" ? -2 : r.pacing === "NO_BUDGET" ? -1 : STATUS_SEVERITY[r.pacing]);

const SORTERS: Record<SortKey, (a: PortfolioRow, b: PortfolioRow) => number> = {
  // Needs attention first (most important reason), then spend.
  attention: (a, b) => a.attentionWeight - b.attentionWeight || a.spendMinor - b.spendMinor,
  name: (a, b) => a.name.localeCompare(b.name),
  spend: (a, b) => a.spendMinor - b.spendMinor,
  spendChange: (a, b) => (a.spendChangePct ?? -Infinity) - (b.spendChangePct ?? -Infinity),
  conversions: (a, b) => a.conversions - b.conversions,
  cpa: (a, b) => (a.costPerConversionMinor ?? Infinity) - (b.costPerConversionMinor ?? Infinity),
  pacing: (a, b) => pacingRank(a) - pacingRank(b),
  sync: (a, b) => (a.lastSyncAt ?? "").localeCompare(b.lastSyncAt ?? ""),
};

/** A change in words: short on screen, the full sentence for screen readers and on hover. */
function Change({ c, pct, better }: { c?: ChangeWords | null; pct?: number | null; better?: "up" | "neutral" }) {
  let words = c;
  if (!words && pct !== undefined) {
    if (pct === null) words = { pct: null, verdict: "none", text: "No earlier period to compare" };
    else if (Math.abs(pct) < 5) words = { pct, verdict: "same", text: "About the same" };
    else {
      const base = `${pct > 0 ? "Up" : "Down"} ${Math.round(Math.abs(pct))}%`;
      words = better === "up" ? { pct, verdict: pct > 0 ? "better" : "worse", text: `${base}, ${pct > 0 ? "better" : "worse"}` } : { pct, verdict: "neutral", text: base };
    }
  }
  if (!words) return null;
  const short =
    words.verdict === "too_few" ? "Too few to compare" : words.verdict === "none" ? "—" : words.verdict === "same" ? "About the same" : `${words.pct! > 0 ? "Up" : "Down"} ${Math.round(Math.abs(words.pct!))}%${words.verdict === "better" || words.verdict === "worse" ? `, ${words.verdict}` : ""}`;
  const tone = words.verdict === "better" ? "text-good-ink" : words.verdict === "worse" ? "text-critical-ink" : "text-text-3";
  return (
    <div className={`text-[11px] ${tone}`} title={words.text}>
      <span aria-hidden>{short}</span>
      <span className="sr-only">{words.text}</span>
    </div>
  );
}

function PacingCell({ r }: { r: PortfolioRow }) {
  return r.pacing === "NOT_CONNECTED" ? <NotConnectedBadge /> : r.pacing === "NO_BUDGET" ? <NoBudgetBadge /> : <StatusBadge status={r.pacing} />;
}

function Reasons({ reasons }: { reasons: AttentionReason[] }) {
  if (!reasons.length) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {reasons.map((x) => <Badge key={x.kind} variant={x.tone === "critical" ? "critical" : "warning"}>{x.label}</Badge>)}
    </div>
  );
}

/**
 * Every client on one sortable, filterable table: spend, change, results,
 * pacing, a spend trend and data freshness. A row opens the client. Phones get
 * one card per client instead.
 */
export function PortfolioTable({ rows, totals, labels, rangeQuery, periodLabel, initialAttention = false }: { rows: PortfolioRow[]; totals: PortfolioTotals; labels: LabelInfo[]; rangeQuery: string; periodLabel: string; initialAttention?: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [label, setLabel] = useState("");
  const [owner, setOwner] = useState("");
  const [onlyAttention, setOnlyAttention] = useState(initialAttention);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "attention", dir: -1 });
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
            <option value="none">No manager</option>
          </Select>
        )}
        <label className="flex min-h-8 items-center gap-2 text-sm text-text-2">
          <input type="checkbox" checked={onlyAttention} onChange={(e) => setOnlyAttention(e.target.checked)} className="h-4 w-4 accent-[var(--brand)]" />
          Needs attention ({totals.attention})
        </label>
        <Select value={`${sort.key}:${sort.dir}`} onChange={(e) => { const [key, dir] = e.target.value.split(":"); setSort({ key: key as SortKey, dir: Number(dir) as 1 | -1 }); }} className="w-full sm:hidden" aria-label="Sort clients">
          <option value="attention:-1">Needs attention first</option>
          <option value="spend:-1">Highest spend</option>
          <option value="conversions:-1">Most conversions</option>
          <option value="cpa:1">Lowest cost per conversion</option>
          <option value="name:1">Name A–Z</option>
        </Select>
        <span className="ml-auto text-xs text-text-3">{visible.length} of {rows.length} clients · {periodLabel}</span>
      </div>

      {/* Phones: totals and one card per client. */}
      <div className="flex flex-col gap-2 px-3 md:hidden">
        <div className="rounded-lg border border-border bg-surface-2 p-3">
          <p className="text-xs font-medium text-text-2">{totals.label}</p>
          <dl className="mt-1 grid grid-cols-3 gap-2 text-xs">
            <div><dt className="text-text-3">Spend</dt><dd className="font-semibold tabular">{totals.spend}</dd><Change c={totals.spendChange} /></div>
            <div><dt className="text-text-3">Conversions</dt><dd className="font-semibold tabular">{totals.conversions}</dd><Change c={totals.conversionsChange} /></div>
            <div><dt className="text-text-3">Cost per conversion</dt><dd className="font-semibold tabular">{totals.cpa}</dd><Change c={totals.cpaChange} /></div>
          </dl>
        </div>
        <ul className="flex flex-col gap-2" aria-label="Clients">
          {visible.map((r) => (
            <li key={r.id} className="rounded-lg border border-border p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link href={r.href} className="block truncate font-medium hover:underline">{r.name}</Link>
                  <p className="truncate text-xs text-text-3">
                    {[r.owner, r.platforms.length ? null : "No accounts linked", r.isDemo ? "demo data" : null].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <PacingCell r={r} />
              </div>
              <Reasons reasons={r.reasons} />
              <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
                <div><dt className="text-text-3">Spend</dt><dd className="font-medium tabular">{formatMoney(r.spendMinor, r.currency, { whole: true })}</dd><Change pct={r.spendChangePct} better="neutral" /></div>
                <div><dt className="text-text-3">Conversions</dt><dd className="font-medium tabular">{formatNumber(r.conversions, 0)}</dd><Change pct={r.conversionsChangePct} better="up" /></div>
                <div><dt className="text-text-3">Cost / conv.</dt><dd className="font-medium tabular">{r.costPerConversionMinor === null ? "—" : formatMoney(r.costPerConversionMinor, r.currency)}</dd><Change c={r.costPerConversionChange} /></div>
              </dl>
              {r.platforms.length > 0 && (
                <p className="mt-2 text-[11px] text-text-3">Synced {relativeTime(r.lastSyncAt).toLowerCase()}{r.stale && <span className="text-warning-ink"> · data is old</span>}</p>
              )}
            </li>
          ))}
          {visible.length === 0 && <li className="px-2 py-8 text-center text-sm text-text-3">No clients match these filters.</li>}
        </ul>
      </div>

      <div className="hidden md:block">
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
            <tr className="border-b border-border bg-surface-2/60">
              <td className="py-2.5 pl-5 text-sm font-semibold">{totals.label}</td>
              <td />
              <td className="py-2.5 text-right"><div className="font-semibold tabular">{totals.spend}</div><Change c={totals.spendChange} /></td>
              <td className="py-2.5 text-right"><div className="font-semibold tabular">{totals.conversions}</div><Change c={totals.conversionsChange} /></td>
              <td className="py-2.5 text-right"><div className="font-semibold tabular">{totals.cpa}</div><Change c={totals.cpaChange} /></td>
              <td className="py-2.5 text-xs text-text-2">{totals.attention ? `${totals.attention} need${totals.attention === 1 ? "s" : ""} attention` : "All clear"}</td>
              <td />
              <td className="pr-5" />
            </tr>
            {visible.map((r) => (
              <TR key={r.id} className="cursor-pointer" onClick={(e) => { if (!(e.target as HTMLElement).closest("a,button")) router.push(r.href); }}>
                <TD className="pl-5">
                  <Link href={r.href} className="font-medium text-text hover:underline">{r.name}</Link>
                  {(r.owner || r.labels.length > 0 || r.isDemo) && (
                    <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-text-3">
                      {r.owner}
                      {r.labels.map((l) => <LabelBadge key={l.id} label={l} />)}
                      {r.isDemo && <span className="text-info-ink">· demo data</span>}
                    </div>
                  )}
                  <Reasons reasons={r.reasons} />
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
                <TD className="text-right">
                  <div>{r.costPerConversionMinor === null ? "—" : formatMoney(r.costPerConversionMinor, r.currency)}</div>
                  <Change c={r.costPerConversionChange} />
                </TD>
                <TD><PacingCell r={r} /></TD>
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
      </div>
      <p className="px-5 pt-3 pb-4 text-xs text-text-3">
        Spend and conversions cover the selected range; changes compare with the comparison period (under 5% is “about the same”; fewer than 10 conversions is “too few to compare”). Pacing is for the current budget period. “Needs attention” uses the last 30 days, as on Home. <Link href={`/performance?client=all&${rangeQuery}`} className="text-brand hover:underline">View all clients combined</Link>
      </p>
    </div>
  );
}
