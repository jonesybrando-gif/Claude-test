import { describe, expect, it } from "vitest";
import { afterFailure, clientIp, lockRemaining, RULES, throttleKeys, type ThrottleState } from "../login-throttle";

const t0 = new Date("2026-10-17T12:00:00Z");
const at = (min: number) => new Date(t0.getTime() + min * 60_000);

function failTimes(n: number, rule = RULES.pair, start: ThrottleState | null = null, minuteStep = 0.5) {
  let s = start;
  for (let i = 0; i < n; i++) s = afterFailure(s, rule, at(i * minuteStep));
  return s!;
}

describe("login throttling", () => {
  it("locks a pair after 5 failures within 15 minutes, for 15 minutes", () => {
    expect(failTimes(4).lockedUntil).toBeNull();
    const s = failTimes(5);
    expect(s.lockedUntil).not.toBeNull();
    expect(lockRemaining(s, at(2))).toBeGreaterThan(14 * 60_000);
    expect(lockRemaining(s, at(20))).toBe(0);
  });

  it("starts a fresh window after it expires", () => {
    const s = failTimes(4);
    const later = afterFailure(s, RULES.pair, at(30));
    expect(later.failures).toBe(1);
    expect(later.lockedUntil).toBeNull();
  });

  it("starts fresh after a lock lifts", () => {
    const locked = failTimes(5);
    const after = afterFailure(locked, RULES.pair, at(17));
    expect(after.failures).toBe(1);
  });

  it("keys pair, ip and email separately and normalise email", () => {
    expect(throttleKeys(" Me@Agency.com ", "1.2.3.4")).toEqual({ pair: "pair:me@agency.com|1.2.3.4", ip: "ip:1.2.3.4", email: "email:me@agency.com" });
  });

  it("reads the client IP from proxy headers", () => {
    const h = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null });
    expect(clientIp(h({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }))).toBe("203.0.113.9");
    expect(clientIp(h({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(clientIp(h({}))).toBe("unknown");
  });
});
