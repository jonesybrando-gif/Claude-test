import { describe, expect, it, vi } from "vitest";

const breakdown = vi.fn();
vi.mock("../query", () => ({ metricBreakdown: (...args: unknown[]) => breakdown(...args) }));

import { bucketPositions, gscRankings, rankQueries } from "../gsc-rankings";

describe("bucketPositions", () => {
  it("counts each query once by its rounded weighted position", () => {
    const b = bucketPositions([
      { position: 1 }, { position: 3.4 }, // 1–3
      { position: 3.5 }, { position: 10.2 }, // 4–10
      { position: 10.5 }, { position: 20.4 }, // 11–20
      { position: 20.5 }, { position: 87 }, // 21+
      { position: null }, { position: 0 }, // skipped
    ]);
    expect(b).toEqual({ top3: 2, top10: 2, top20: 2, beyond20: 2, total: 8 });
  });

  it("is empty for no rows", () => {
    expect(bucketPositions([])).toEqual({ top3: 0, top10: 0, top20: 0, beyond20: 0, total: 0 });
  });
});

describe("rankQueries", () => {
  it("sorts by clicks and computes position change vs previous period", () => {
    const out = rankQueries(
      [
        { query: "a", clicks: 5, impressions: 100, ctr: 5, position: 4 },
        { query: "b", clicks: 20, impressions: 50, ctr: 40, position: 2 },
        { query: "new", clicks: 5, impressions: 200, ctr: 2.5, position: 12 },
      ],
      [{ query: "a", clicks: 1, impressions: 10, ctr: 10, position: 7 }, { query: "b", clicks: 1, impressions: 1, ctr: 100, position: 1.5 }],
      10,
    );
    expect(out.map((q) => q.query)).toEqual(["b", "new", "a"]);
    expect(out[0]).toMatchObject({ previousPosition: 1.5, positionChange: 0.5 });
    expect(out[1]).toMatchObject({ previousPosition: null, positionChange: null });
    expect(out[2]).toMatchObject({ previousPosition: 7, positionChange: -3 });
    expect(rankQueries(out, [], 1)).toHaveLength(1);
  });
});

describe("gscRankings", () => {
  it("compares with the preceding period of equal length", async () => {
    breakdown.mockReset();
    breakdown
      .mockResolvedValueOnce([{ value: "q", metrics: { "gsc.clicks": 3, "gsc.impressions": 30, "gsc.ctr": 10, "gsc.position": 2.2 } }])
      .mockResolvedValueOnce([{ value: "q", metrics: { "gsc.clicks": 1, "gsc.impressions": 20, "gsc.ctr": 5, "gsc.position": 5 } }]);
    const r = await gscRankings("c1", "2026-10-08", "2026-10-14");
    expect(breakdown.mock.calls[0].slice(0, 5)).toEqual(["c1", "query", ["gsc.clicks", "gsc.impressions", "gsc.ctr", "gsc.position"], "2026-10-08", "2026-10-14"]);
    expect(breakdown.mock.calls[1].slice(3, 5)).toEqual(["2026-10-01", "2026-10-07"]);
    expect(r.queries[0]).toMatchObject({ query: "q", clicks: 3, impressions: 30, position: 2.2, previousPosition: 5 });
    expect(r.queries[0].positionChange).toBeCloseTo(-2.8);
    expect(r.buckets).toMatchObject({ top3: 1, total: 1 });
    expect(r.previousBuckets).toMatchObject({ top10: 1, total: 1 });
  });
});
