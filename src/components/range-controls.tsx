"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { PRESET_LABEL, type CompareMode, type RangePreset } from "@/lib/date-ranges";
import { Input, Select } from "./ui/input";

export function RangeControls({ preset, compare, from, to }: { preset: RangePreset; compare: CompareMode; from: string; to: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const set = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select aria-label="Date range" value={preset} onChange={(e) => set({ range: e.target.value, ...(e.target.value !== "custom" ? { from: null, to: null } : { from, to }) })} className="w-40">
        {(Object.keys(PRESET_LABEL) as RangePreset[]).map((p) => (
          <option key={p} value={p}>{PRESET_LABEL[p]}</option>
        ))}
      </Select>
      {preset === "custom" && (
        <>
          <Input type="date" aria-label="From" defaultValue={from} onBlur={(e) => e.target.value && set({ from: e.target.value })} className="w-38" />
          <Input type="date" aria-label="To" defaultValue={to} onBlur={(e) => e.target.value && set({ to: e.target.value })} className="w-38" />
        </>
      )}
      <Select aria-label="Compare to" value={compare} onChange={(e) => set({ compare: e.target.value })} className="w-48">
        <option value="previous_month">vs. previous month</option>
        <option value="previous_period">vs. previous period</option>
        <option value="none">No comparison</option>
      </Select>
    </div>
  );
}
