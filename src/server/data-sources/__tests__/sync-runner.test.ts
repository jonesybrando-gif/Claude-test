import { beforeEach, describe, expect, it, vi } from "vitest";

// In-memory stand-ins for the few Prisma calls the runner makes.
const state = vi.hoisted(() => ({
  due: [] as { id: string }[],
  claimable: new Set<string>(),
  assets: {} as Record<string, unknown>,
  updates: [] as { id: string; data: Record<string, unknown> }[],
}));

vi.mock("../../db", () => ({
  prisma: {
    dataAsset: {
      findMany: vi.fn(async () => state.due),
      updateMany: vi.fn(async ({ where }: { where: { id: string } }) => {
        const ok = state.claimable.delete(where.id);
        return { count: ok ? 1 : 0 };
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const a = state.assets[where.id];
        if (a instanceof Error) throw a;
        return a ?? null;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        state.updates.push({ id: where.id, data });
        return {};
      }),
    },
    metricDaily: { deleteMany: vi.fn(), createMany: vi.fn() },
    $transaction: vi.fn(async () => []),
  },
}));
vi.mock("../registry", () => ({
  getDataSourceAdapter: () => ({ provider: "CALLRAIL", kinds: ["CALLRAIL_COMPANY"], listAssets: async () => [], fetchMetrics: async () => [] }),
}));
vi.mock("../credentials", () => ({ dataSourceAccessToken: async () => undefined, readSecret: () => "k", markDataSourceNeedsReauth: vi.fn() }));

import { syncDueDataAssets } from "../sync";

const asset = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  clientId: "c1",
  kind: "CALLRAIL_COMPANY",
  status: "ACTIVE",
  timezone: null,
  dataCompleteThrough: null,
  settings: null,
  connection: { id: "conn", provider: "CALLRAIL", status: "ACTIVE" },
  client: { timezone: "America/New_York", archivedAt: null },
  ...over,
});

beforeEach(() => {
  state.due = [];
  state.claimable = new Set();
  state.assets = {};
  state.updates = [];
});

describe("syncDueDataAssets", () => {
  it("keeps going when one asset fails, even outside the adapter call", async () => {
    state.due = [{ id: "a" }, { id: "b" }, { id: "c" }];
    state.claimable = new Set(["a", "b", "c"]);
    state.assets = { a: asset("a", { timezone: "Not/AZone" }), b: new Error("db hiccup"), c: asset("c") };
    const out = await syncDueDataAssets();
    expect(out.map((r) => [r.assetId, r.status])).toEqual([["a", "FAILED"], ["b", "FAILED"], ["c", "SUCCEEDED"]]);
  });

  it("skips assets another runner already claimed", async () => {
    state.due = [{ id: "a" }, { id: "b" }];
    state.claimable = new Set(["b"]);
    state.assets = { a: asset("a"), b: asset("b") };
    const out = await syncDueDataAssets();
    expect(out.map((r) => r.assetId)).toEqual(["b"]);
  });

  it("starts nothing after the deadline", async () => {
    state.due = [{ id: "a" }];
    state.claimable = new Set(["a"]);
    state.assets = { a: asset("a") };
    expect(await syncDueDataAssets({ deadline: Date.now() - 1 })).toEqual([]);
  });

  it("never syncs a paused or unlinked asset", async () => {
    state.due = [{ id: "a" }];
    state.claimable = new Set(["a"]);
    state.assets = { a: asset("a", { status: "DISCONNECTED" }) };
    const [r] = await syncDueDataAssets();
    expect(r.status).toBe("SKIPPED");
  });
});
