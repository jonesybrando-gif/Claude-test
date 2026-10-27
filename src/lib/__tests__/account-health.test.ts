import { describe, expect, it } from "vitest";
import { isAccountDisconnected, isAccountRetired } from "../account-health";

describe("account health", () => {
  it("a replaced or stopped account is retired, not disconnected", () => {
    const a = { status: "DISCONNECTED", connectionId: null, isDemo: false };
    expect(isAccountDisconnected(a)).toBe(false);
    expect(isAccountRetired(a)).toBe(true);
  });
  it("an account on an expired or removed login is disconnected", () => {
    expect(isAccountDisconnected({ status: "NEEDS_REAUTH", connectionId: "c1" })).toBe(true);
    expect(isAccountDisconnected({ status: "DISCONNECTED", connectionId: "c1" })).toBe(true);
    expect(isAccountDisconnected({ status: "ACTIVE", connectionId: "c1" })).toBe(false);
  });
  it("respects an explicit monitored flag", () => {
    expect(isAccountDisconnected({ status: "DISCONNECTED", monitored: false })).toBe(false);
  });
});
