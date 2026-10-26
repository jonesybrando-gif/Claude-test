"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import type { PlatformKey } from "@/lib/platforms";
import { formatMoney, formatNumber } from "@/lib/money";
import { Input, Select } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { PlatformLabel } from "@/components/platform-badge";
import { InfoTip } from "@/components/ui/info-tip";
import { KPI_BY_KEY } from "@/lib/kpis";

export interface CampaignRow {
  id: string;
  name: string;
  platform: PlatformKey;
  status: string;
  costMinor: number;
  clicks: number;
  conversions: number;
  conversionValueMinor: number;
}

type SortKey = "name" | "spend" | "clicks" | "conversions" | "cpa" | "roas";

const cpa = (r: Pick<CampaignRow, "costMinor" | "conversions">) => (r.conversions > 0 ? r.costMinor / r.conversions : null);
const roas = (r: Pick<CampaignRow, "costMinor" | "conversionValueMinor">) => (r.costMinor > 0 && r.conversionValueMinor > 0 ? r.conversionValueMinor / r.costMinor : null);

const SORTERS: Record<SortKey, (a: CampaignRow, b: CampaignRow) => number> = {
  name: (a, b) => a.name.localeCompare(b.name),
  spend: (a, b) => a.costMinor - b.costMinor,
  clicks: (a, b) => a.clicks - b.clicks,
  conversions: (a, b) => a.conversions - b.conversions,
  cpa: (a, b) => (cpa(a) ?? Infinity) - (cpa(b) ?? Infinity),
  roas: (a, b) => (roas(a) ?? -Infinity) - (roas(b) ?? -Infinity),
};

const MOBILE_SORTS = new Set(["spend:-1", "spend:1", "conversions:-1", "clicks:-1", "cpa:1", "roas:-1", "name:1"]);

/**
 * Campaigns for the selected range: sorted by spend, with campaigns that
 * spent nothing tucked behind "Show inactive", sortable columns, search and a
 * totals row.
 */
export function CampaignTable({ rows, currency }: { rows: CampaignRow[]; currency: string }) {
  const [q, setQ] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "spend", dir: -1 });
  const inactive = rows.filter((r) => r.costMinor === 0 && r.clicks === 0 && r.conversions === 0).length;
  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows
      .filter((r) => (showInactive || needle || r.costMinor !== 0 || r.clicks !== 0 || r.conversions !== 0) && (!needle || r.name.toLowerCase().includes(needle)))
      .sort((a, b) => SORTERS[sort.key](a, b) * sort.dir || b.costMinor - a.costMinor || a.name.localeCompare(b.name));
  }, [rows, q, showInactive, sort]);
  const total = visible.reduce(
    (t, r) => ({ costMinor: t.costMinor + r.costMinor, clicks: t.clicks + r.clicks, conversions: t.conversions + r.conversions, conversionValueMinor: t.conversionValueMinor + r.conversionValueMinor }),
    { costMinor: 0, clicks: 0, conversions: 0, conversionValueMinor: 0 },
  );
  const head = (key: SortKey, text: string, className = "text-right", info?: string) => (
    <TH className={className} aria-sort={sort.key === key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <span className="inline-flex items-center gap-1 whitespace-nowrap">
        <button type="button" className="inline-flex items-center gap-1 hover:text-text cursor-pointer" onClick={() => setSort((s) => ({ key, dir: s.key === key ? ((-s.dir) as 1 | -1) : key === "name" || key === "cpa" ? 1 : -1 }))}>
          {text}
          {sort.key === key && (sort.dir === 1 ? <ArrowUp className="h-3 w-3" aria-hidden /> : <ArrowDown className="h-3 w-3" aria-hidden />)}
        </button>
        {info && <InfoTip label={text} text={info} align="end" />}
      </span>
    </TH>
  );
  const money = (m: number | null, whole = false) => (m === null ? "—" : formatMoney(m, currency, { whole }));

  if (rows.length === 0) return <p className="px-5 pb-5 text-sm text-text-3">No campaigns for this client yet. They appear after the first sync of a linked ad account.</p>;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 px-5 pb-3">
        <Input placeholder="Search campaigns…" value={q} onChange={(e) => setQ(e.target.value)} className="w-full sm:w-60" aria-label="Search campaigns" />
        {/* Phones have no column headers to click, so offer the same sorts here. */}
        <Select
          aria-label="Sort campaigns"
          className="w-auto md:hidden"
          value={`${sort.key}:${sort.dir}`}
          onChange={(e) => {
            const [key, dir] = e.target.value.split(":");
            setSort({ key: key as SortKey, dir: Number(dir) as 1 | -1 });
          }}
        >
          <option value="spend:-1">Highest spend</option>
          <option value="spend:1">Lowest spend</option>
          <option value="conversions:-1">Most conversions</option>
          <option value="clicks:-1">Most clicks</option>
          <option value="cpa:1">Lowest cost per conversion</option>
          <option value="roas:-1">Highest return on ad spend</option>
          <option value="name:1">Name A–Z</option>
          {!MOBILE_SORTS.has(`${sort.key}:${sort.dir}`) && <option value={`${sort.key}:${sort.dir}`}>Custom</option>}
        </Select>
        <span className="ml-auto text-xs text-text-3">
          {visible.length} of {rows.length} campaigns
          {inactive > 0 && !q && (
            <>
              {" · "}
              <button type="button" className="underline hover:text-text cursor-pointer" onClick={() => setShowInactive((v) => !v)} aria-expanded={showInactive}>
                {showInactive ? "Hide" : "Show"} {inactive} inactive
              </button>
            </>
          )}
        </span>
      </div>
      {/* Phones: compact cards instead of an eight-column table. */}
      <ul className="flex flex-col gap-2 px-3 md:hidden" aria-label="Campaigns">
        {visible.map((r) => (
          <li key={r.id} className="rounded-lg border border-border p-3">
            <p className="font-medium">{r.name}</p>
            <p className="text-xs text-text-3"><PlatformLabel platform={r.platform} /> · {r.status.charAt(0) + r.status.slice(1).toLowerCase()}</p>
            <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
              <div><dt className="text-text-3">Ad spend</dt><dd className="font-medium tabular">{money(r.costMinor, true)}</dd></div>
              <div><dt className="text-text-3">Conversions</dt><dd className="font-medium tabular">{formatNumber(r.conversions, 0)}</dd></div>
              <div><dt className="text-text-3">Cost per conversion</dt><dd className="font-medium tabular">{money(cpa(r))}</dd></div>
            </dl>
          </li>
        ))}
        {visible.length > 1 && (
          <li className="flex justify-between rounded-lg bg-surface-2 px-3 py-2 text-xs font-medium">
            <span>Total ({visible.length})</span>
            <span className="tabular">{money(total.costMinor, true)} · {formatNumber(total.conversions, 0)} conversions</span>
          </li>
        )}
      </ul>
      <div className="hidden md:block">
      <Table>
        <THead>
          <tr>
            {head("name", "Campaign", "pl-5")}
            <TH>Platform</TH>
            <TH>Status</TH>
            {head("spend", KPI_BY_KEY.spend.label, "text-right", KPI_BY_KEY.spend.plain)}
            {head("clicks", KPI_BY_KEY.clicks.label, "text-right", KPI_BY_KEY.clicks.plain)}
            {head("conversions", KPI_BY_KEY.conversions.label, "text-right", KPI_BY_KEY.conversions.plain)}
            {head("cpa", KPI_BY_KEY.costPerConversion.label, "text-right", KPI_BY_KEY.costPerConversion.plain)}
            {head("roas", KPI_BY_KEY.roas.label, "pr-5 text-right", KPI_BY_KEY.roas.plain)}
          </tr>
        </THead>
        <TBody>
          {visible.map((r) => (
            <TR key={r.id}>
              <TD className="pl-5 font-medium whitespace-normal min-w-56">{r.name}</TD>
              <TD className="text-xs"><PlatformLabel platform={r.platform} /></TD>
              <TD className="text-xs text-text-2">{r.status.charAt(0) + r.status.slice(1).toLowerCase()}</TD>
              <TD className="text-right">{money(r.costMinor, true)}</TD>
              <TD className="text-right">{formatNumber(r.clicks)}</TD>
              <TD className="text-right">{formatNumber(r.conversions, 0)}</TD>
              <TD className="text-right">{money(cpa(r))}</TD>
              <TD className="pr-5 text-right">{roas(r) === null ? "—" : `${roas(r)!.toFixed(2)}×`}</TD>
            </TR>
          ))}
          {visible.length === 0 && (
            <tr><td colSpan={8} className="px-5 py-8 text-center text-sm text-text-3">{q ? "No campaigns match this search." : "No campaign spent anything in this period."}</td></tr>
          )}
        </TBody>
        {visible.length > 1 && (
          <tfoot className="border-t-2 border-border font-medium">
            <tr>
              <td className="px-3 py-2.5 pl-5" colSpan={3}>Total ({visible.length} shown)</td>
              <td className="px-3 py-2.5 text-right">{money(total.costMinor, true)}</td>
              <td className="px-3 py-2.5 text-right">{formatNumber(total.clicks)}</td>
              <td className="px-3 py-2.5 text-right">{formatNumber(total.conversions, 0)}</td>
              <td className="px-3 py-2.5 text-right">{money(cpa(total))}</td>
              <td className="px-3 py-2.5 pr-5 text-right">{roas(total) === null ? "—" : `${roas(total)!.toFixed(2)}×`}</td>
            </tr>
          </tfoot>
        )}
      </Table>
      </div>
    </div>
  );
}
