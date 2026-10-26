"use client";

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { formatKpi, KPI_BY_KEY, kpiChangeWords, kpiValues, type KpiKey } from "@/lib/kpis";
import { formatPct } from "@/lib/money";
import type { MetricTotals } from "@/lib/metrics";
import { Table, TBody, TD, TH, THead, TR } from "../ui/table";

export interface KpiRow {
  id: string;
  label: string;
  sub?: string;
  href?: string;
  totals: MetricTotals;
  previous?: MetricTotals | null;
  badge?: string;
}

/** Sortable KPI table. Each cell is computed from the row's summed totals. */
export function KpiTable({ rows, kpis, currency, firstHeader, showChange }: { rows: KpiRow[]; kpis: KpiKey[]; currency: string; firstHeader: string; showChange?: KpiKey[] }) {
  const [sort, setSort] = useState<{ key: KpiKey | "label"; dir: 1 | -1 }>({ key: "spend", dir: -1 });
  const computed = useMemo(
    () => rows.map((r) => ({ r, values: Object.fromEntries(kpiValues(kpis, r.totals, r.previous ?? null).map((v) => [v.key, v])) as Record<KpiKey, ReturnType<typeof kpiValues>[number]> })),
    [rows, kpis],
  );
  const sorted = useMemo(() => {
    return [...computed].sort((a, b) => {
      if (sort.key === "label") return a.r.label.localeCompare(b.r.label) * sort.dir;
      const av = a.values[sort.key]?.value ?? -Infinity;
      const bv = b.values[sort.key]?.value ?? -Infinity;
      return (av - bv) * sort.dir;
    });
  }, [computed, sort]);
  const head = (key: KpiKey | "label", label: string, right = true, full?: string) => (
    <TH className={right ? "text-right" : "pl-5"} aria-sort={sort.key === key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button className="inline-flex items-center gap-1 hover:text-text cursor-pointer" title={full} aria-label={full ? `Sort by ${full}` : undefined} onClick={() => setSort((s) => ({ key, dir: s.key === key ? ((-s.dir) as 1 | -1) : key === "label" ? 1 : -1 }))}>
        {label}
        {sort.key === key && (sort.dir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </button>
    </TH>
  );
  return (
    <Table>
      <THead>
        <tr>
          {head("label", firstHeader, false)}
          {kpis.map((k) => <Fragment key={k}>{head(k, KPI_BY_KEY[k].short, true, KPI_BY_KEY[k].label)}</Fragment>)}
        </tr>
      </THead>
      <TBody>
        {sorted.map(({ r, values }) => (
          <TR key={r.id}>
            <TD className="pl-5">
              {r.href ? <Link href={r.href} className="font-medium hover:underline">{r.label}</Link> : <span className="font-medium">{r.label}</span>}
              {(r.sub || r.badge) && <div className="text-xs text-text-3">{[r.sub, r.badge].filter(Boolean).join(" · ")}</div>}
            </TD>
            {kpis.map((k) => {
              const v = values[k];
              return (
                <TD key={k} className="text-right">
                  {formatKpi(k, v.value, currency, { whole: true })}
                  {showChange?.includes(k) && v.changePct !== null && (
                    <div className={`text-xs ${v.tone === "good" ? "text-good-ink" : v.tone === "bad" ? "text-critical-ink" : "text-text-3"}`}>
                      <span aria-hidden>
                        {v.verdict === "few" ? "too few to compare" : v.verdict === "same" ? "about the same" : `${v.changePct > 0 ? "+" : "−"}${formatPct(Math.abs(v.changePct), 0)}${v.verdict === "better" ? " · better" : v.verdict === "worse" ? " · worse" : ""}`}
                      </span>
                      <span className="sr-only">{kpiChangeWords(v, currency).aria}</span>
                    </div>
                  )}
                </TD>
              );
            })}
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
