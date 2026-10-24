// Pure 12-column grid operations for the dashboard editor: move, resize, place
// and compact without overlaps (the same rules react-grid-layout uses: widgets
// that collide are pushed down, then everything floats up).

import { DEFAULT_SIZE, GRID_COLS, MAX_H, MIN_SIZE } from "./parse";
import type { DashboardWidget, WidgetKind } from "./types";

type Box = Pick<DashboardWidget, "id" | "x" | "y" | "w" | "h">;

export const overlaps = (a: Box, b: Box) => a.id !== b.id && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Top-to-bottom, left-to-right: the reading (and phone stacking) order. */
export function sortByPosition<T extends Box>(ws: T[]): T[] {
  return [...ws].sort((a, b) => a.y - b.y || a.x - b.x);
}

/** Floats every widget up as far as it goes without overlapping one above it. */
export function compact<T extends Box>(ws: T[]): T[] {
  const placed: T[] = [];
  for (const w of sortByPosition(ws)) {
    const next = { ...w };
    while (next.y > 0 && !placed.some((p) => overlaps({ ...next, y: next.y - 1 }, p))) next.y--;
    placed.push(next);
  }
  // Keep the caller's order (ids stable for React keys).
  const byId = new Map(placed.map((p) => [p.id, p]));
  return ws.map((w) => byId.get(w.id)!);
}

/** Pushes widgets that collide with `fixedId` (and then with each other) downwards. */
function pushDown<T extends Box>(ws: T[], fixedId: string): T[] {
  const out = ws.map((w) => ({ ...w }));
  const fixed = out.find((w) => w.id === fixedId)!;
  const settled: T[] = [fixed];
  for (const w of sortByPosition(out.filter((w) => w.id !== fixedId))) {
    while (settled.some((s) => overlaps(w, s))) {
      const blocker = settled.filter((s) => overlaps(w, s)).reduce((a, b) => (a.y + a.h > b.y + b.h ? a : b));
      w.y = blocker.y + blocker.h;
    }
    settled.push(w);
  }
  return out;
}

/** Moves one widget to (x, y), keeping it inside the grid, then resolves collisions. */
export function moveWidget<T extends Box>(ws: T[], id: string, x: number, y: number): T[] {
  const next = ws.map((w) => (w.id === id ? { ...w, x: clamp(Math.round(x), 0, GRID_COLS - w.w), y: Math.max(0, Math.round(y)) } : w));
  return compact(pushDown(next, id));
}

/** Resizes one widget (respecting its kind's minimum), then resolves collisions. */
export function resizeWidget<T extends Box & { kind: WidgetKind }>(ws: T[], id: string, w: number, h: number): T[] {
  const next = ws.map((it) => {
    if (it.id !== id) return it;
    const min = MIN_SIZE[it.kind];
    return { ...it, w: clamp(Math.round(w), min.w, GRID_COLS - it.x), h: clamp(Math.round(h), min.h, MAX_H) };
  });
  return compact(pushDown(next, id));
}

/** First free spot (top-down, left-right) for a w × h widget. */
export function findSpot(ws: Box[], w: number, h: number): { x: number; y: number } {
  const bottom = ws.reduce((m, it) => Math.max(m, it.y + it.h), 0);
  for (let y = 0; y <= bottom; y++) {
    for (let x = 0; x + w <= GRID_COLS; x++) {
      if (!ws.some((it) => overlaps({ id: "__new__", x, y, w, h }, it))) return { x, y };
    }
  }
  return { x: 0, y: bottom };
}

/** A new widget of `kind` at its default size in the first free spot. */
export function placeNew(ws: Box[], kind: WidgetKind, id: string): Box {
  const { w, h } = DEFAULT_SIZE[kind];
  return { id, w, h, ...findSpot(ws, w, h) };
}

/** Random-enough widget id (the grid only needs uniqueness within a dashboard). */
export function newWidgetId(): string {
  return `w${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-3)}`;
}

/** Copies widgets with fresh ids (duplicating dashboards, applying templates). */
export function withFreshIds(ws: DashboardWidget[], makeId: () => string = newWidgetId): DashboardWidget[] {
  const seen = new Set<string>();
  return ws.map((w) => {
    let id = makeId();
    while (seen.has(id)) id = makeId();
    seen.add(id);
    return { ...w, id, ...(w.metrics ? { metrics: [...w.metrics] } : {}) };
  });
}
