"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp } from "lucide-react";
import type { Platform } from "@prisma/client";
import type { PacingStatus } from "@/lib/pacing/status";
import { formatMoney, formatNumber, formatPct } from "@/lib/money";
import { relativeTime } from "@/lib/time";
import { Input, Select } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { PlatformLabel } from "@/components/platform-badge";
import { LabelBadge, type LabelInfo } from "@/components/label-badge";
import { NotConnectedBadge, StatusBadge } from "@/components/status-badge";
import { Sparkline } from "@/components/kpi/sparkline";

export interface PortfolioRow {
  id: string;
  name: string;
  href: string;
  labels: LabelInfo[];
  manager: string | null;
  platforms: Platform[];
  currency: string;
  spendMinor: number;
  prevSpendMinor: number | null;
  results: number;
  prevResults: number | null;
  /** "conversions" or "leads": whichever this client reports. */
  resultLabel: string;
  pacing: PacingStatus | "NOT_CONNECTED" | null;
  spark: number[];
  lastSync: string | null;
  isDemo: boolean;
}

type Key = "name" | "spend" | "spendChange" | "results" | "cpr" | "pacing" | "lastSync";
const PACING_ORDER: Record<string, number> = { OVERSPENDING: 6, UNDERSPENDING: 5, SLIGHTLY_OVER: 4, SLIGHTLY_UNDER: 3, ON_TARGET: 2, NOT_STARTED: 1, NO_BUDGET: 0, NOT_CONNECTED: -1 };

const change = (cur: number, prev: number | null) => (prev && prev > 0 ? ((cur - prev) / prev) * 100 : null);
const signed = (p: number) => (Math.abs(p) < 0.5 ? "0%" : `${p > 0 ? "+" : "−"}${formatPct(Math.abs(p), 0)}`);
const cpr = (r: PortfolioRow) => (r.results > 0 ? r.spendMinor / r.results : null);

/** Every client at a glance: spend, change, results, cost per result, pacing, trend and freshness. */
export function PortfolioTable({ rows, labels, managers }: { rows: PortfolioRow[]; labels: LabelInfo[]; managers: string[] }) {
  const [q, setQ] = useState("");
  const [label, setLabel] = useState("");
  const [manager, setManager] = useState("");
  const [sort, setSort] = useState<{ key: Key; dir: 1 | -1 }>({ key: "spend", dir: -1 });

  const value = (r: PortfolioRow, k: Key): number | string | null => {
    switch (k) {
      case "name": return r.name.toLowerCase();
      case "spend": return r.spendMinor;
      case "spendChange": return change(r.spendMinor, r.prevSpendMinor);
      case "results": return r.results;
      case "cpr": return cpr(r);
      case "pacing": return r.pacing ? PACING_ORDER[r.pacing] : -2;
      case "lastSync": return r.lastSync;
    }
  };
  const visible = useMemo(() => {
    const out = rows.filter((r) => {
      if (q && !r.name.toLowerCase().includes(q.toLowerCase())) return false;
      if (label === "none" ? r.labels.length > 0 : label && !r.labels.some((l) => l.id === label)) return false;
      if (manager && r.manager !== manager) return false;
      return true;
    });
    return out.sort((a, b) => {
      const x = value(a, sort.key);
      const y = value(b, sort.key);
      if (x === null && y === null) return 0;
      if (x === null) return 1;
      if (y === null) return -1;
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }, [rows, q, label, manager, sort]);

  const head = (k: Key, text: string, className = "text-right") => (
    <TH className={className} aria-sort={sort.key === k ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button type="button" className="inline-flex cursor-pointer items-center gap-1 hover:text-text" onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? ((-s.dir) as 1 | -1) : k === "name" ? 1 : -1 }))}>
        {text}
        {sort.key === k && (sort.dir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </button>
    </TH>
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 px-5 pb-3">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search clients…" className="w-full sm:w-56" aria-label="Search clients" />
        {labels.length > 0 && (
          <Select value={label} onChange={(e) => setLabel(e.target.value)} className="w-full sm:w-44" aria-label="Label">
            <option value="">All labels</option>
            {labels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            <option value="none">No label</option>
          </Select>
        )}
        {managers.length > 0 && (
          <Select value={manager} onChange={(e) => setManager(e.target.value)} className="w-full sm:w-44" aria-label="Account manager">
            <option value="">All owners</option>
            {managers.map((m) => <option key={m} value={m}>{m}</option>)}
          </Select>
        )}
        <span className="ml-auto text-xs text-text-3">{visible.length} of {rows.length} clients</span>
      </div>
      <Table className="min-w-[900px]">
        <THead>
          <tr>
            {head("name", "Client", "pl-5")}
            {head("spend", "Spend")}
            {head("spendChange", "vs previous")}
            {head("results", "Results")}
            {head("cpr", "Cost / result")}
            {head("pacing", "Pacing", "")}
            <TH>Daily spend</TH>
            {head("lastSync", "Synced", "pr-5")}
          </tr>
        </THead>
        <TBody>
          {visible.map((r) => {
            const ch = change(r.spendMinor, r.prevSpendMinor);
            const rc = r.prevResults !== null ? change(r.results, r.prevResults) : null;
            const per = cpr(r);
            return (
              <TR key={r.id} className="cursor-pointer hover:bg-surface-2">
                <TD className="pl-5">
                  <Link href={r.href} className="font-medium hover:underline">{r.name}</Link>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                    {r.platforms.map((p) => <PlatformLabel key={p} platform={p} />)}
                    {r.labels.map((l) => <LabelBadge key={l.id} label={l} />)}
                    {r.platforms.length === 0 && <span className="text-text-3">No accounts linked</span>}
                  </div>
                </TD>
                <TD className="text-right font-medium">{r.platforms.length ? formatMoney(r.spendMinor, r.currency, { whole: true }) : "—"}</TD>
                <TD className="text-right text-text-2">{ch === null ? "—" : signed(ch)}</TD>
                <TD className="text-right">
                  {r.results > 0 ? formatNumber(r.results, r.results < 100 ? 1 : 0) : r.platforms.length ? "0" : "—"}
                  {r.results > 0 && <div className="text-[11px] text-text-3">{r.resultLabel}{rc !== null && ` · ${signed(rc)}`}</div>}
                </TD>
                <TD className="text-right">{per === null ? "—" : formatMoney(per, r.currency)}</TD>
                <TD>{r.pacing === "NOT_CONNECTED" ? <NotConnectedBadge /> : r.pacing ? <StatusBadge status={r.pacing} /> : <span className="text-xs text-text-3">No budget</span>}</TD>
                <TD>{r.spark.some((v) => v > 0) ? <Sparkline values={r.spark} width={96} height={24} /> : <span className="text-xs text-text-3">—</span>}</TD>
                <TD className="pr-5 text-xs text-text-2">{r.isDemo ? "Demo" : r.lastSync ? relativeTime(r.lastSync) : r.platforms.length ? "Never" : "—"}</TD>
              </TR>
            );
          })}
          {visible.length === 0 && <tr><td colSpan={8} className="px-5 py-8 text-center text-sm text-text-3">No clients match.</td></tr>}
        </TBody>
      </Table>
    </div>
  );
}
