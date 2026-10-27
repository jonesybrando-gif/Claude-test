"use client";

import { loadOnHover } from "@/lib/link-hover";
import { startNavigationProgress } from "@/components/navigation-progress";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Columns3, SlidersHorizontal } from "lucide-react";
import type { PlatformKey } from "@/lib/platforms";
import { STATUS_SEVERITY } from "@/lib/pacing/status";
import type { AttentionReason, ChangeWords } from "@/lib/portfolio";
import type { BudgetState } from "@/lib/budget-status";
import { formatMoney, formatNumber } from "@/lib/money";
import { relativeTime } from "@/lib/time";
import { Input, Select } from "@/components/ui/input";
import { LabelBadge, type LabelInfo } from "@/components/label-badge";
import { PlatformLabel } from "@/components/platform-badge";
import { BudgetStatus } from "@/components/status-dot";
import { Sparkline } from "@/components/kpi/sparkline";
import { cn } from "@/components/ui/cn";

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
  results: number;
  /** Set when this client's results aren't conversions, e.g. "clicks" for an awareness goal. */
  resultUnit?: string | null;
  resultsChange: ChangeWords | null;
  costPerResultMinor: number | null;
  costPerResultChange: ChangeWords | null;
  /** Budget status for the current period (worse of to-date and forecast), or why there is none. */
  pacing: BudgetState;
  varianceMinor: number | null;
  /** Needs-attention reasons, the same as on Home (last 30 complete days). */
  reasons: AttentionReason[];
  attentionTone: "critical" | "watch" | null;
  attentionWeight: number;
  /** The most pressing budget recommendation, if any. */
  nextStep: string | null;
  dailySpend: number[];
  lastSyncAt: string | null;
  stale: boolean;
  isDemo: boolean;
}

export interface PortfolioTotals {
  label: string;
  spend: string;
  spendChangePct: number | null;
  results: string;
  resultsChange: ChangeWords | null;
  costPerResult: string;
  costPerResultChange: ChangeWords | null;
}

type SortKey = "attention" | "name" | "spend" | "spendChange" | "results" | "cpr" | "budget" | "sync";
type FilterKey = "all" | "attention" | "over" | "under" | "well" | "missing";
type OptionalColumn = "platforms" | "owner" | "sync";

const OVER = new Set<BudgetState>(["OVERSPENDING", "SLIGHTLY_OVER"]);
const UNDER = new Set<BudgetState>(["UNDERSPENDING", "SLIGHTLY_UNDER"]);
const budgetRank = (r: PortfolioRow) => (r.pacing === "NOT_CONNECTED" ? -2 : r.pacing === "NO_BUDGET" || r.pacing === "NOT_STARTED" ? -1 : STATUS_SEVERITY[r.pacing]);

const FILTERS: { key: FilterKey; label: string; test: (r: PortfolioRow) => boolean }[] = [
  { key: "all", label: "All", test: () => true },
  { key: "attention", label: "Needs attention", test: (r) => r.reasons.length > 0 },
  { key: "over", label: "Over budget", test: (r) => OVER.has(r.pacing) },
  { key: "under", label: "Under budget", test: (r) => UNDER.has(r.pacing) },
  // Nothing flagged and cost per result steady or better.
  { key: "well", label: "Performing well", test: (r) => r.reasons.length === 0 && r.results > 0 && (r.costPerResultChange?.verdict === "better" || r.costPerResultChange?.verdict === "same" || (r.costPerResultChange?.verdict === "counting" && (r.costPerResultChange.pct ?? 0) < 0)) },
  { key: "missing", label: "Missing data", test: (r) => r.pacing === "NOT_CONNECTED" || r.platforms.length === 0 || r.stale },
];

const SORTERS: Record<SortKey, (a: PortfolioRow, b: PortfolioRow) => number> = {
  attention: (a, b) => a.attentionWeight - b.attentionWeight || a.spendMinor - b.spendMinor,
  name: (a, b) => a.name.localeCompare(b.name),
  spend: (a, b) => a.spendMinor - b.spendMinor,
  results: (a, b) => a.results - b.results,
  cpr: (a, b) => (a.costPerResultMinor ?? Infinity) - (b.costPerResultMinor ?? Infinity),
  budget: (a, b) => budgetRank(a) - budgetRank(b) || Math.abs(a.varianceMinor ?? 0) - Math.abs(b.varianceMinor ?? 0),
  spendChange: (a, b) => (a.spendChangePct ?? -Infinity) - (b.spendChangePct ?? -Infinity),
  sync: (a, b) => (a.lastSyncAt ?? "").localeCompare(b.lastSyncAt ?? ""),
};

const COLUMN_LABEL: Record<OptionalColumn, string> = { platforms: "Platforms", owner: "Account manager", sync: "Last sync" };
const COLUMNS_KEY = "mn.clients.columns";

/** "↓24%" after a figure, coloured by whether it's better or worse; the full sentence on hover and for screen readers. */
function Delta({ c, pct }: { c?: ChangeWords | null; pct?: number | null }) {
  if (c) {
    if (c.verdict === "none") return null;
    if (c.verdict === "too_few") return <span className="ml-1.5 text-xs text-text-3" title={c.text}>few results<span className="sr-only">, {c.text}</span></span>;
    if (c.pct === null) return null;
    const tone = c.verdict === "better" ? "text-good-ink" : c.verdict === "worse" ? "text-critical-ink" : "text-text-3";
    const short = c.verdict === "same" ? "flat" : `${c.pct > 0 ? "↑" : "↓"}${Math.round(Math.abs(c.pct))}%`;
    return <span className={cn("ml-1.5 text-xs", tone)} title={c.text}><span aria-hidden>{short}</span><span className="sr-only">, {c.text}</span></span>;
  }
  if (pct === null || pct === undefined) return null;
  const short = Math.abs(pct) < 5 ? "flat" : `${pct > 0 ? "↑" : "↓"}${Math.round(Math.abs(pct))}%`;
  const words = Math.abs(pct) < 5 ? "about the same as before" : `${pct > 0 ? "up" : "down"} ${Math.round(Math.abs(pct))}% from before`;
  return <span className="ml-1.5 text-xs text-text-3" title={words}><span aria-hidden>{short}</span><span className="sr-only">, {words}</span></span>;
}

/** Critical is a filled red dot, Watch a hollow amber ring: the shape differs, not only the colour. */
function AttentionDot({ r }: { r: PortfolioRow }) {
  if (!r.attentionTone) return <span className="inline-block h-2.5 w-2.5 shrink-0" aria-hidden />;
  const words = r.reasons.map((x) => x.label).join(" · ");
  return (
    <span title={`${r.attentionTone === "critical" ? "Critical" : "Watch"}: ${words}`} className="inline-flex shrink-0">
      <span aria-hidden className={cn("inline-block h-2.5 w-2.5 rounded-full", r.attentionTone === "critical" ? "bg-critical" : "border-2 border-dot-watch")} />
      <span className="sr-only">{r.attentionTone === "critical" ? "Critical: " : "Watch: "}{r.reasons.map((x) => x.label).join(", ")}.</span>
    </span>
  );
}

/** A small popover (details/summary) for the toolbar's Filters and Columns menus; Escape or a click outside closes it. */
function ToolbarMenu({ label, icon, active, children }: { label: string; icon: React.ReactNode; active?: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current?.open && !ref.current.contains(e.target as Node)) ref.current.removeAttribute("open");
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && ref.current?.open) {
        ref.current.removeAttribute("open");
        ref.current.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);
  return (
    <details ref={ref} className="relative">
      <summary className={cn("inline-flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-lg px-3 text-sm hover:bg-surface-2", active ? "font-medium text-text" : "text-text-2")}>
        {icon}
        {label}
      </summary>
      <div className="absolute right-0 z-20 mt-1 flex w-64 flex-col gap-3 rounded-xl border border-border bg-surface p-3 shadow-lg">{children}</div>
    </details>
  );
}

/**
 * Every client on one line: spend, results, cost per result, budget status
 * and a spend trend. A row opens the client; the chevron shows why it needs
 * attention and the next step. Phones get one card per client.
 */
export function PortfolioTable({ rows, totals, labels, initialFilter, combinedHref }: { rows: PortfolioRow[]; totals: PortfolioTotals; labels: LabelInfo[]; initialFilter?: string; combinedHref?: string }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [label, setLabel] = useState("");
  const [owner, setOwner] = useState("");
  const [filter, setFilter] = useState<FilterKey>(FILTERS.some((f) => f.key === initialFilter) ? (initialFilter as FilterKey) : "all");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "attention", dir: -1 });
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [cols, setCols] = useState<Set<OptionalColumn>>(new Set());
  const owners = useMemo(() => [...new Set(rows.map((r) => r.owner).filter((o): o is string => !!o))].sort(), [rows]);

  // Extra columns are a per-viewer convenience, remembered in this browser.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(COLUMNS_KEY) ?? "[]") as OptionalColumn[];
      if (Array.isArray(saved)) setCols(new Set(saved.filter((c) => c in COLUMN_LABEL)));
    } catch {
      // Storage unavailable: defaults only.
    }
  }, []);
  const toggleCol = (c: OptionalColumn) =>
    setCols((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      try {
        localStorage.setItem(COLUMNS_KEY, JSON.stringify([...next]));
      } catch {
        // ignore
      }
      return next;
    });

  // Counts per filter chip reflect search, label and manager, so the chips always add up to what is listed.
  const base = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (needle && !r.name.toLowerCase().includes(needle)) return false;
      if (label === "none" && r.labels.length > 0) return false;
      if (label && label !== "none" && !r.labels.some((l) => l.id === label)) return false;
      if (owner === "none" && r.owner) return false;
      if (owner && owner !== "none" && r.owner !== owner) return false;
      return true;
    });
  }, [rows, q, label, owner]);
  const visible = useMemo(() => {
    const test = FILTERS.find((f) => f.key === filter)!.test;
    return base.filter(test).sort((a, b) => SORTERS[sort.key](a, b) * sort.dir || a.name.localeCompare(b.name));
  }, [base, filter, sort]);

  const head = (key: SortKey, text: string, className = "") => (
    <th scope="col" className={cn("px-4 py-3 text-xs font-medium whitespace-nowrap text-text-2", className)} aria-sort={sort.key === key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button type="button" className="inline-flex cursor-pointer items-center gap-1 hover:text-text" onClick={() => setSort((s) => ({ key, dir: s.key === key ? ((-s.dir) as 1 | -1) : key === "name" ? 1 : -1 }))}>
        {text}
        {sort.key === key && (sort.dir === 1 ? <ArrowUp className="h-3 w-3" aria-hidden /> : <ArrowDown className="h-3 w-3" aria-hidden />)}
      </button>
    </th>
  );
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const extra = [...cols];
  const colCount = 7 + extra.length;
  const filtersActive = !!label || !!owner;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder={`Search ${rows.length} client${rows.length === 1 ? "" : "s"}`} value={q} onChange={(e) => setQ(e.target.value)} className="h-9 w-full sm:w-64" aria-label="Search clients" />
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Show">
          {FILTERS.map((f) => {
            const n = base.filter(f.test).length;
            const on = filter === f.key;
            if (f.key !== "all" && n === 0 && !on) return null;
            return (
              <button
                key={f.key}
                type="button"
                aria-pressed={on}
                onClick={() => setFilter(f.key)}
                className={cn("inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium", on ? "border-text bg-text text-surface" : "border-border bg-surface text-text-2 hover:text-text")}
              >
                {f.label}
                <span className={cn("tabular", on ? "opacity-80" : "text-text-3")}>{n}</span>
              </button>
            );
          })}
        </div>
        <div className="ml-auto flex items-center gap-1">
          {(labels.length > 0 || owners.length > 0) && (
            <ToolbarMenu label={filtersActive ? "Filters on" : "Filters"} active={filtersActive} icon={<SlidersHorizontal className="h-4 w-4" aria-hidden />}>
              {labels.length > 0 && (
                <label className="flex flex-col gap-1 text-xs text-text-2">
                  Label
                  <Select value={label} onChange={(e) => setLabel(e.target.value)} aria-label="Label">
                    <option value="">All labels</option>
                    {labels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                    <option value="none">No label</option>
                  </Select>
                </label>
              )}
              {owners.length > 0 && (
                <label className="flex flex-col gap-1 text-xs text-text-2">
                  Account manager
                  <Select value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Account manager">
                    <option value="">All managers</option>
                    {owners.map((o) => <option key={o} value={o}>{o}</option>)}
                    <option value="none">No manager</option>
                  </Select>
                </label>
              )}
            </ToolbarMenu>
          )}
          <ToolbarMenu label="Columns" icon={<Columns3 className="h-4 w-4" aria-hidden />}>
            {(Object.keys(COLUMN_LABEL) as OptionalColumn[]).map((c) => (
              <label key={c} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={cols.has(c)} onChange={() => toggleCol(c)} className="h-4 w-4 accent-[var(--brand)]" />
                {COLUMN_LABEL[c]}
              </label>
            ))}
          </ToolbarMenu>
        </div>
      </div>

      {/* Phones: sort, the totals, then one card per client. */}
      <div className="flex flex-col gap-2 md:hidden">
        <Select value={`${sort.key}:${sort.dir}`} onChange={(e) => { const [key, dir] = e.target.value.split(":"); setSort({ key: key as SortKey, dir: Number(dir) as 1 | -1 }); }} aria-label="Sort clients">
          <option value="attention:-1">Needs attention first</option>
          <option value="spend:-1">Highest spend</option>
          <option value="spendChange:-1">Biggest spend increase</option>
          <option value="results:-1">Most results</option>
          <option value="cpr:1">Lowest cost per result</option>
          <option value="budget:-1">Furthest off budget</option>
          <option value="name:1">Name A–Z</option>
        </Select>
        <div className="grid grid-cols-3 gap-2 rounded-xl border border-border bg-surface-2/70 p-3 text-sm tabular">
          <span className="col-span-3 text-xs font-medium text-text-2">{totals.label}</span>
          <span><span className="block text-xs text-text-3">Ad spend</span><span className="font-semibold">{totals.spend}</span><Delta pct={totals.spendChangePct} /></span>
          <span><span className="block text-xs text-text-3">Results</span><span className="font-semibold">{totals.results}</span><Delta c={totals.resultsChange} /></span>
          <span><span className="block text-xs text-text-3">Cost / result</span><span className="font-semibold">{totals.costPerResult}</span><Delta c={totals.costPerResultChange} /></span>
        </div>
      </div>
      <ul className="flex flex-col gap-2 md:hidden" aria-label="Clients">
        {visible.map((r) => (
          <li key={r.id}>
            <Link {...loadOnHover} href={r.href} className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4 hover:bg-surface-2">
              <span className="flex items-center gap-2">
                <AttentionDot r={r} />
                <span className="min-w-0 flex-1 truncate font-medium">{r.name}</span>
                <BudgetStatus state={r.pacing} varianceMinor={r.varianceMinor} currency={r.currency} className="text-[13px]" />
              </span>
              <span className="grid grid-cols-3 gap-2 text-sm tabular">
                <span><span className="block text-xs text-text-3">Ad spend</span>{formatMoney(r.spendMinor, r.currency, { whole: true })}<Delta pct={r.spendChangePct} /></span>
                <span><span className="block text-xs text-text-3">Results</span>{formatNumber(r.results, 0)}{r.resultUnit && <span className="text-text-3"> {r.resultUnit}</span>}<Delta c={r.resultsChange} /></span>
                <span><span className="block text-xs text-text-3">Cost / result</span>{r.costPerResultMinor === null ? "—" : formatMoney(r.costPerResultMinor, r.currency)}<Delta c={r.costPerResultChange} /></span>
              </span>
              {r.reasons.length > 0 && <span className="text-xs text-text-2">{r.reasons.map((x) => x.label).join(" · ")}</span>}
              <span className="text-xs text-text-3">
                {r.platforms.length ? <>Synced {relativeTime(r.lastSyncAt).toLowerCase()}{r.stale && <span className="text-warning-ink"> · data is old</span>}</> : "No accounts linked"}
                {r.isDemo && " · demo"}
              </span>
            </Link>
          </li>
        ))}
        {visible.length === 0 && <li className="rounded-xl border border-border bg-surface px-4 py-8 text-center text-sm text-text-3">No clients match.</li>}
      </ul>

      <div className="hidden overflow-x-auto rounded-xl border border-border bg-surface md:block">
        <table className="w-full min-w-[860px] text-sm tabular">
          <thead className="border-b border-border">
            <tr className="text-right">
              {head("name", "Client", "pl-5 text-left")}
              {head("spend", "Ad spend")}
              {head("results", "Results")}
              {head("cpr", "Cost / result")}
              {head("budget", "Budget")}
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-text-2">Spend trend</th>
              {extra.map((c) => (c === "sync" ? <Fragment key={c}>{head("sync", COLUMN_LABEL[c], "text-left")}</Fragment> : <th key={c} scope="col" className="px-4 py-3 text-left text-xs font-medium whitespace-nowrap text-text-2">{COLUMN_LABEL[c]}</th>))}
              <th scope="col" className="w-12 pr-3"><span className="sr-only">Details</span></th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-border bg-surface-2/70 text-right">
              <td className="py-3 pl-5 pr-4 text-left font-semibold">{totals.label}</td>
              <td className="px-4 py-3 font-semibold">{totals.spend}<Delta pct={totals.spendChangePct} /></td>
              <td className="px-4 py-3 font-semibold">{totals.results}<Delta c={totals.resultsChange} /></td>
              <td className="px-4 py-3 font-semibold">{totals.costPerResult}<Delta c={totals.costPerResultChange} /></td>
              <td colSpan={colCount - 4} />
            </tr>
            {visible.map((r) => {
              const isOpen = open.has(r.id);
              return (
                <Fragment key={r.id}>
                  <tr
                    className={cn("cursor-pointer border-b border-border/60 text-right hover:bg-surface-2/60", isOpen && "bg-surface-2/60")}
                    onClick={(e) => { if (!(e.target as HTMLElement).closest("a,button")) { startNavigationProgress(); router.push(r.href); } }}
                  >
                    <td className="py-3 pl-5 pr-4 text-left">
                      <span className="flex min-w-0 items-center gap-3">
                        <AttentionDot r={r} />
                        <Link {...loadOnHover} href={r.href} className="truncate font-medium text-text hover:underline">{r.name}</Link>
                        {r.labels.map((l) => <LabelBadge key={l.id} label={l} />)}
                        {r.isDemo && <span className="text-xs text-text-3">demo</span>}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{formatMoney(r.spendMinor, r.currency, { whole: true })}<Delta pct={r.spendChangePct} /></td>
                    <td className="px-4 py-3 whitespace-nowrap">{formatNumber(r.results, 0)}{r.resultUnit && <span className="text-text-3"> {r.resultUnit}</span>}<Delta c={r.resultsChange} /></td>
                    <td className="px-4 py-3 whitespace-nowrap">{r.costPerResultMinor === null ? <span className="text-text-3">—</span> : formatMoney(r.costPerResultMinor, r.currency)}<Delta c={r.costPerResultChange} /></td>
                    <td className="px-4 py-3 text-right"><BudgetStatus state={r.pacing} varianceMinor={r.varianceMinor} currency={r.currency} /></td>
                    <td className="px-4 py-3 text-left"><Sparkline values={r.dailySpend} width={96} height={24} /></td>
                    {extra.map((c) => (
                      <td key={c} className="px-4 py-3 text-left text-[13px] whitespace-nowrap text-text-2">
                        {c === "platforms" ? (
                          <span className="flex gap-3">{r.platforms.length ? r.platforms.map((p) => <PlatformLabel key={p} platform={p} />) : <span className="text-text-3">None linked</span>}</span>
                        ) : c === "owner" ? (
                          r.owner ?? <span className="text-text-3">—</span>
                        ) : r.platforms.length === 0 ? (
                          <span className="text-text-3">—</span>
                        ) : (
                          <span className={r.stale ? "text-warning-ink" : ""}>{relativeTime(r.lastSyncAt)}</span>
                        )}
                      </td>
                    ))}
                    <td className="pr-3 text-right">
                      <button type="button" onClick={() => toggle(r.id)} aria-expanded={isOpen} aria-label={`${isOpen ? "Hide" : "Show"} details for ${r.name}`} className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-text-3 hover:bg-surface-2 hover:text-text">
                        {isOpen ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronRight className="h-4 w-4" aria-hidden />}
                      </button>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="border-b border-border/60 bg-surface-2/60">
                      <td colSpan={colCount} className="px-5 pt-1 pb-4 pl-[2.75rem]">
                        <div className="flex flex-wrap items-start gap-x-8 gap-y-2 text-[13px] text-text-2">
                          {r.reasons.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-text-3">Why it&apos;s flagged</p>
                              <p className="text-text">{r.reasons.map((x) => x.label).join(" · ")}</p>
                            </div>
                          )}
                          {r.nextStep && (
                            <div>
                              <p className="text-xs font-medium text-text-3">Budget</p>
                              <p className="text-text">{r.nextStep}</p>
                            </div>
                          )}
                          <div>
                            <p className="text-xs font-medium text-text-3">Accounts</p>
                            <p className="flex flex-wrap gap-3">{r.platforms.length ? r.platforms.map((p) => <PlatformLabel key={p} platform={p} />) : "None linked"}</p>
                          </div>
                          {r.platforms.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-text-3">Synced</p>
                              <p className={r.stale ? "text-warning-ink" : "text-text"}>{relativeTime(r.lastSyncAt)}{r.stale && " · data is old"}</p>
                            </div>
                          )}
                          {r.owner && (
                            <div>
                              <p className="text-xs font-medium text-text-3">Manager</p>
                              <p className="text-text">{r.owner}</p>
                            </div>
                          )}
                          <Link href={r.href} className="ml-auto self-center font-semibold text-brand-text hover:underline">Open client →</Link>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={colCount} className="px-5 py-10 text-center text-sm text-text-3">No clients match.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 text-xs text-text-3">
        <p className="max-w-[90ch]">
          {visible.length} of {rows.length} clients.{" "}
          <span className="inline-flex items-center gap-1 align-middle"><span aria-hidden className="inline-block h-2 w-2 rounded-full bg-critical" /> critical</span>,{" "}
          <span className="inline-flex items-center gap-1 align-middle"><span aria-hidden className="inline-block h-2 w-2 rounded-full border-2 border-dot-watch" /> watch</span>
          , judged on the last 30 complete days. Results follow each client’s goal (leads, calls, sales or bookings from the ad platforms, each counted once; clicks for awareness clients). Ad platforms can still add results for the last 14 days, so recent changes in results show in grey, without better or worse. Budget status is for the current budget period.
        </p>
        {combinedHref && <Link href={combinedHref} className="shrink-0 text-[13px] font-medium text-brand-text hover:underline">All clients combined →</Link>}
      </div>
    </div>
  );
}
