import type { CSSProperties } from "react";
import { sortByPosition } from "@/lib/dashboards/layout";
import type { DashboardWidget } from "@/lib/dashboards/types";
import type { DashboardData } from "@/lib/dashboards/widget-data";
import { WidgetView, type AdSlots } from "./widget-view";

/** Height of one grid row in px (and the gap between rows/columns). Shared with the editor. */
export const ROW_PX = 64;
export const GAP_PX = 12;

/**
 * A dashboard in view mode: a 12-column grid on tablets and up, widgets
 * stacked in reading order on phones.
 */
export function DashboardGrid({ widgets, data, currency, slots, staff = false }: { widgets: DashboardWidget[]; data: DashboardData; currency: string; slots?: AdSlots; staff?: boolean }) {
  if (widgets.length === 0) return null;
  return (
    <div className="flex flex-col gap-3 md:grid md:grid-cols-12 md:gap-3 md:[grid-auto-rows:64px]">
      {sortByPosition(widgets).map((w) => (
        <div
          key={w.id}
          className="min-w-0 md:[grid-column:var(--gx)/span_var(--gw)] md:[grid-row:var(--gy)/span_var(--gh)]"
          style={{ "--gx": w.x + 1, "--gw": w.w, "--gy": w.y + 1, "--gh": w.h } as CSSProperties}
        >
          <WidgetView widget={w} data={data[w.id]} currency={currency} slots={slots} staff={staff} />
        </div>
      ))}
    </div>
  );
}
