"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, AlertTriangle, Info } from "lucide-react";
import type { PacingRow } from "@/server/pacing-service";
import { STATUS_LABEL, STATUS_SEVERITY, type PacingStatus } from "@/lib/pacing/status";
import { PLATFORMS, PLATFORM_LABEL, type PlatformKey } from "@/lib/platforms";
import { formatMoney, formatPct } from "@/lib/money";
import { relativeTime } from "@/lib/time";
import { NoBudgetBadge, StaleBadge, StatusBadge } from "../status-badge";
import { PlatformLabel } from "../platform-badge";
import { Input, Select } from "../ui/input";
import { Table, TBody, TD, TH, THead, TR } from "../ui/table";
import { PaceBar } from "./pace-bar";

type SortKey = "status" | "client" | "budget" | "spend" | "pacing" | "projectedVariance" | "consumed" | "sync";

const statusKey = (r: PacingRow) => (r.result ? STATUS_SEVERITY[r.result.status] : 1) + (r.disconnected ? 10 : 0);

const sorters: Record<SortKey, (a: PacingRow, b: PacingRow) => number> = {
  status: (a, b) => statusKey(b) - statusKey(a) || Math.abs(b.result?.projectedVarianceMinor ?? 0) - Math.abs(a.result?.projectedVarianceMinor ?? 0),
  client: (a, b) => a.clientName.localeCompare(b.clientName),
  budget: (a, b) => (b.result?.budgetMinor ?? 0) - (a.result?.budgetMinor ?? 0),
  spend: (a, b) => (b.result?.actualToDateMinor ?? b.unbudgetedSpendMinor) - (a.result?.actualToDateMinor ?? a.unbudgetedSpendMinor),
  pacing: (a, b) => (b.result?.pacingPct ?? -1) - (a.result?.pacingPct ?? -1),
  projectedVariance: (a, b) => (b.result?.projectedVarianceMinor ?? 0) - (a.result?.projectedVarianceMinor ?? 0),
  consumed: (a, b) => (b.result?.pctBudgetConsumed ?? -1) - (a.result?.pctBudgetConsumed ?? -1),
  sync: (a, b) => (a.lastSuccessfulSyncAt ?? "").localeCompare(b.lastSuccessfulSyncAt ?? ""),
};

const FILTER_STATUSES: (PacingStatus | "ATTENTION" | "NO_BUDGET_ROWS")[] = ["ATTENTION", "OVERSPENDING", "SLIGHTLY_OVER", "ON_TARGET", "SLIGHTLY_UNDER", "UNDERSPENDING", "NOT_STARTED", "NO_BUDGET_ROWS"];

export function PacingTable({ rows }: { rows: PacingRow[] }) {
  const [q, setQ] = useState("");
  const [platform, setPlatform] = useState<PlatformKey | "">("");
  const [manager, setManager] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "status", dir: 1 });

  const managers = useMemo(() => [...new Set(rows.map((r) => r.managerName).filter((m): m is string => !!m))].sort(), [rows]);

  const visible = useMemo(() => {
    const out = rows.filter((r) => {
      if (q && !r.clientName.toLowerCase().includes(q.toLowerCase()) && !r.label.toLowerCase().includes(q.toLowerCase())) return false;
      if (platform && !r.platforms.includes(platform)) return false;
      if (manager && r.managerName !== manager) return false;
      if (status === "ATTENTION" && !r.attention) return false;
      if (status === "NO_BUDGET_ROWS" && r.result) return false;
      if (status && status !== "ATTENTION" && status !== "NO_BUDGET_ROWS" && r.result?.status !== status) return false;
      return true;
    });
    return out.sort((a, b) => sorters[sort.key](a, b) * sort.dir);
  }, [rows, q, platform, manager, status, sort]);

  const header = (key: SortKey, label: string, className = "") => (
    <TH className={className} aria-sort={sort.key === key ? (sort.dir === 1 ? "descending" : "ascending") : "none"}>
      <button className="inline-flex items-center gap-1 hover:text-text cursor-pointer" onClick={() => setSort((s) => ({ key, dir: s.key === key ? ((-s.dir) as 1 | -1) : 1 }))}>
        {label}
        {sort.key === key && (sort.dir === 1 ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
      </button>
    </TH>
  );

  return (
    <div>
      <div className="flex flex-wrap gap-2 px-5 pb-3">
        <Input placeholder="Search clients…" value={q} onChange={(e) => setQ(e.target.value)} className="w-full sm:w-56" aria-label="Search clients" />
        <Select value={platform} onChange={(e) => setPlatform(e.target.value as PlatformKey | "")} className="w-full sm:w-44" aria-label="Platform">
          <option value="">All platforms</option>
          {PLATFORMS.map((p) => <option key={p} value={p}>{PLATFORM_LABEL[p]}</option>)}
        </Select>
        <Select value={manager} onChange={(e) => setManager(e.target.value)} className="w-full sm:w-44" aria-label="Account manager">
          <option value="">All managers</option>
          {managers.map((m) => <option key={m} value={m}>{m}</option>)}
        </Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full sm:w-48" aria-label="Pacing status">
          <option value="">All statuses</option>
          {FILTER_STATUSES.map((s) => (
            <option key={s} value={s}>{s === "ATTENTION" ? "Needs attention" : s === "NO_BUDGET_ROWS" ? "No budget set" : STATUS_LABEL[s]}</option>
          ))}
        </Select>
        <span className="ml-auto self-center text-xs text-text-3">{visible.length} of {rows.length} budget lines</span>
      </div>
      <Table>
        <THead>
          <tr>
            {header("client", "Client", "pl-5")}
            <TH>Platform</TH>
            {header("status", "Status")}
            {header("budget", "Monthly budget", "text-right")}
            {header("spend", "MTD spend", "text-right")}
            <TH className="text-right">Expected to date</TH>
            {header("consumed", "Budget used vs. month elapsed")}
            {header("pacing", "Pacing", "text-right")}
            <TH className="text-right">Remaining</TH>
            <TH className="text-right">Projected month-end</TH>
            {header("projectedVariance", "Projected variance", "text-right")}
            {header("sync", "Last sync", "pr-5")}
          </tr>
        </THead>
        <TBody>
          {visible.map((r) => {
            const res = r.result;
            const c = r.currency;
            return (
              <TR key={r.key}>
                <TD className="pl-5">
                  <Link href={`/clients/${r.clientId}`} className="font-medium text-text hover:underline">{r.clientName}</Link>
                  <div className="text-xs text-text-3">{r.level === "CLIENT" ? "Combined budget" : r.label}</div>
                </TD>
                <TD>
                  <div className="flex flex-col gap-0.5 text-xs">
                    {r.platforms.map((p) => <PlatformLabel key={p} platform={p} />)}
                  </div>
                </TD>
                <TD>
                  <div className="flex flex-col items-start gap-1">
                    {res ? <StatusBadge status={res.status} /> : <NoBudgetBadge />}
                    {res && res.forecastStatus !== res.status && res.forecastStatus !== "ON_TARGET" && (
                      <span className="text-[11px] text-text-2">Forecast: {STATUS_LABEL[res.forecastStatus].toLowerCase()}</span>
                    )}
                    {r.disconnected && <StaleBadge label="Disconnected" />}
                    {!r.disconnected && r.stale && <StaleBadge />}
                  </div>
                </TD>
                <TD className="text-right">{res ? formatMoney(res.budgetMinor, c, { whole: true }) : "—"}</TD>
                <TD className="text-right font-medium">
                  {formatMoney(res?.actualToDateMinor ?? r.unbudgetedSpendMinor, c, { whole: true })}
                  {r.hasEstimatedSpend && <div className="text-[11px] font-normal text-warning-ink">estimated</div>}
                </TD>
                <TD className="text-right text-text-2">{res ? formatMoney(res.expectedToDateMinor, c, { whole: true }) : "—"}</TD>
                <TD className="min-w-48">{res && res.pctBudgetConsumed !== null ? <PaceBar consumed={res.pctBudgetConsumed} elapsed={res.pctPeriodElapsed} expected={res.budgetMinor ? (res.expectedToDateMinor / res.budgetMinor) * 100 : 0} status={res.status} /> : <span className="text-text-3">—</span>}</TD>
                <TD className="text-right font-medium">{res ? formatPct(res.pacingPct) : "—"}</TD>
                <TD className="text-right text-text-2">{res ? formatMoney(res.remainingBudgetMinor, c, { whole: true }) : "—"}</TD>
                <TD className="text-right">{res ? formatMoney(res.projectedMinor, c, { whole: true }) : "—"}</TD>
                <TD className="text-right">
                  {res ? (
                    <span className={res.projectedVarianceMinor > 0 ? "text-critical-ink" : res.projectedVarianceMinor < 0 ? "text-text-2" : ""}>
                      {res.projectedVarianceMinor > 0 ? "+" : res.projectedVarianceMinor < 0 ? "−" : ""}
                      {formatMoney(Math.abs(res.projectedVarianceMinor), c, { whole: true })}
                    </span>
                  ) : "—"}
                </TD>
                <TD className="pr-5 text-xs text-text-2">
                  <span title={r.lastSuccessfulSyncAt ?? "Never synced"}>{relativeTime(r.lastSuccessfulSyncAt)}</span>
                  {r.warnings.length > 0 && (
                    <span className="ml-1 inline-flex align-middle" title={r.warnings.join("\n")}>
                      <AlertTriangle className="h-3.5 w-3.5 text-warning-ink" aria-label={r.warnings.join(". ")} />
                    </span>
                  )}
                </TD>
              </TR>
            );
          })}
          {visible.length === 0 && (
            <tr>
              <td colSpan={12} className="px-5 py-10 text-center text-sm text-text-3">
                <Info className="mx-auto mb-2 h-5 w-5" aria-hidden /> No budget lines match these filters.
              </td>
            </tr>
          )}
        </TBody>
      </Table>
      <p className="px-5 pt-3 pb-4 text-xs text-text-3">
        <strong className="font-medium text-text-2">Pacing</strong> = actual spend ÷ expected spend to date × 100. It is not the share of the monthly budget used — that is shown in the bar, with the tick marking where spend should be today.
      </p>
    </div>
  );
}
