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
import { LabelBadge, type LabelInfo } from "../label-badge";
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

export function PacingTable({ rows, labels = [], labelsByClient = {} }: { rows: PacingRow[]; labels?: LabelInfo[]; labelsByClient?: Record<string, string[]> }) {
  const [q, setQ] = useState("");
  const [label, setLabel] = useState("");
  const [client, setClient] = useState("");
  const [platform, setPlatform] = useState<PlatformKey | "">("");
  const [manager, setManager] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "status", dir: 1 });

  const clients = useMemo(() => [...new Map(rows.map((r) => [r.clientId, r.clientName])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [rows]);
  const labelById = useMemo(() => new Map(labels.map((l) => [l.id, l])), [labels]);
  const managers = useMemo(() => [...new Set(rows.map((r) => r.managerName).filter((m): m is string => !!m))].sort(), [rows]);

  const visible = useMemo(() => {
    const out = rows.filter((r) => {
      if (q && !r.clientName.toLowerCase().includes(q.toLowerCase()) && !r.label.toLowerCase().includes(q.toLowerCase())) return false;
      if (client && r.clientId !== client) return false;
      if (label === "none" && (labelsByClient[r.clientId]?.length ?? 0) > 0) return false;
      if (label && label !== "none" && !labelsByClient[r.clientId]?.includes(label)) return false;
      if (platform && !r.platforms.includes(platform)) return false;
      if (manager && r.managerName !== manager) return false;
      if (status === "ATTENTION" && !r.attention) return false;
      if (status === "NO_BUDGET_ROWS" && r.result) return false;
      if (status && status !== "ATTENTION" && status !== "NO_BUDGET_ROWS" && r.result?.status !== status) return false;
      return true;
    });
    return out.sort((a, b) => sorters[sort.key](a, b) * sort.dir);
  }, [rows, q, client, label, labelsByClient, platform, manager, status, sort]);

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
        <Input placeholder="Search clients…" value={q} onChange={(e) => setQ(e.target.value)} className="w-full sm:w-48" aria-label="Search clients" />
        <Select value={client} onChange={(e) => setClient(e.target.value)} className="w-full sm:w-48" aria-label="Client">
          <option value="">All clients</option>
          {clients.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </Select>
        {labels.length > 0 && (
          <Select value={label} onChange={(e) => setLabel(e.target.value)} className="w-full sm:w-40" aria-label="Label">
            <option value="">All labels</option>
            {labels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            <option value="none">No label</option>
          </Select>
        )}
        <Select value={platform} onChange={(e) => setPlatform(e.target.value as PlatformKey | "")} className="w-full sm:w-44" aria-label="Platform">
          <option value="">All platforms</option>
          {PLATFORMS.map((p) => <option key={p} value={p}>{PLATFORM_LABEL[p]}</option>)}
        </Select>
        {managers.length > 0 && <Select value={manager} onChange={(e) => setManager(e.target.value)} className="w-full sm:w-44" aria-label="Account manager">
          <option value="">All managers</option>
          {managers.map((m) => <option key={m} value={m}>{m}</option>)}
        </Select>}
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full sm:w-48" aria-label="Pacing status">
          <option value="">All statuses</option>
          {FILTER_STATUSES.map((s) => (
            <option key={s} value={s}>{s === "ATTENTION" ? "Needs attention" : s === "NO_BUDGET_ROWS" ? "No budget set" : STATUS_LABEL[s]}</option>
          ))}
        </Select>
        <span className="ml-auto self-center text-xs text-text-3">{visible.length} of {rows.length} budget lines</span>
      </div>
      {/* Seven columns that fit a laptop screen: related figures share a cell. */}
      <Table className="min-w-[860px] table-fixed">
        <colgroup>
          <col className="w-[23%]" />
          <col className="w-[13%]" />
          <col className="w-[14%]" />
          <col className="w-[19%]" />
          <col className="w-[8%]" />
          <col className="w-[13%]" />
          <col className="w-[10%]" />
        </colgroup>
        <THead>
          <tr>
            {header("client", "Client", "pl-5")}
            {header("status", "Status")}
            {header("spend", "Spend / budget", "text-right")}
            {header("consumed", "Budget used vs. time")}
            {header("pacing", "Pacing", "text-right")}
            {header("projectedVariance", "Projected", "text-right")}
            {header("sync", "Synced", "pr-5")}
          </tr>
        </THead>
        <TBody>
          {visible.map((r) => {
            const res = r.result;
            const c = r.currency;
            const tags = (labelsByClient[r.clientId] ?? []).map((id) => labelById.get(id)).filter((l): l is LabelInfo => !!l);
            return (
              <TR key={r.key}>
                <TD className="pl-5">
                  <Link href={`/clients/${r.clientId}`} className="block truncate font-medium text-text hover:underline" title={r.clientName}>{r.clientName}</Link>
                  <div className="truncate text-xs text-text-3" title={r.level === "CLIENT" ? "Combined budget" : r.label}>{r.level === "CLIENT" ? "Combined budget" : r.label}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                    {r.platforms.map((p) => <PlatformLabel key={p} platform={p} />)}
                    {tags.map((l) => <LabelBadge key={l.id} label={l} />)}
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
                <TD className="text-right">
                  <div className="font-medium">{formatMoney(res?.actualToDateMinor ?? r.unbudgetedSpendMinor, c, { whole: true })}</div>
                  {res ? (
                    <div className="text-xs text-text-2">of {formatMoney(res.budgetMinor, c, { whole: true })} · {formatMoney(res.remainingBudgetMinor, c, { whole: true })} left</div>
                  ) : (
                    <div className="text-xs text-text-3">no budget</div>
                  )}
                  {r.hasEstimatedSpend && <div className="text-[11px] text-warning-ink">estimated</div>}
                </TD>
                <TD>
                  {res && res.pctBudgetConsumed !== null ? (
                    <>
                      <PaceBar consumed={res.pctBudgetConsumed} elapsed={res.pctPeriodElapsed} expected={res.budgetMinor ? (res.expectedToDateMinor / res.budgetMinor) * 100 : 0} status={res.status} />
                      <div className="mt-1 text-[11px] text-text-3">Expected by now {formatMoney(res.expectedToDateMinor, c, { whole: true })}</div>
                    </>
                  ) : <span className="text-text-3">—</span>}
                </TD>
                <TD className="text-right font-medium">{res ? formatPct(res.pacingPct) : "—"}</TD>
                <TD className="text-right">
                  {res ? (
                    <>
                      <div>{formatMoney(res.projectedMinor, c, { whole: true })}</div>
                      <div className={`text-xs ${res.projectedVarianceMinor > 0 ? "text-critical-ink" : "text-text-2"}`}>
                        {res.projectedVarianceMinor > 0 ? "+" : res.projectedVarianceMinor < 0 ? "−" : ""}
                        {formatMoney(Math.abs(res.projectedVarianceMinor), c, { whole: true })} vs budget
                      </div>
                    </>
                  ) : "—"}
                </TD>
                <TD className="pr-5 text-xs text-text-2">
                  <div className="flex flex-wrap items-center gap-1">
                  <span title={r.lastSuccessfulSyncAt ?? "Never synced"}>{relativeTime(r.lastSuccessfulSyncAt)}</span>
                  {r.warnings.length > 0 && (
                    <span className="inline-flex" title={r.warnings.join("\n")}>
                      <AlertTriangle className="h-3.5 w-3.5 text-warning-ink" aria-label={r.warnings.join(". ")} />
                    </span>
                  )}
                  </div>
                </TD>
              </TR>
            );
          })}
          {visible.length === 0 && (
            <tr>
              <td colSpan={7} className="px-5 py-10 text-center text-sm text-text-3">
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
