import { describe, expect, it } from "vitest";
import { isNotConnected } from "../connection";

const synced = { lastSuccessfulSyncAt: "2026-10-20T10:00:00.000Z", isDemo: false };
const never = { lastSuccessfulSyncAt: null, isDemo: false };

describe("isNotConnected", () => {
  it("flags budget lines with no linked account", () => {
    expect(isNotConnected("CLIENT", [])).toBe(true);
  });
  it("flags lines whose accounts have never synced", () => {
    expect(isNotConnected("ACCOUNT", [never])).toBe(true);
    expect(isNotConnected("CLIENT", [never, never])).toBe(true);
  });
  it("treats a line as connected once any account has synced", () => {
    expect(isNotConnected("CLIENT", [never, synced])).toBe(false);
  });
  it("never flags demo accounts or unbudgeted spend", () => {
    expect(isNotConnected("ACCOUNT", [{ lastSuccessfulSyncAt: null, isDemo: true }])).toBe(false);
    expect(isNotConnected("UNBUDGETED", [never])).toBe(false);
  });
});
