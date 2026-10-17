// Failed sign-in throttling. Three counters per attempt:
//  - pair  (email + IP): a few wrong passwords lock that email *from that address* only,
//    so someone elsewhere can't lock the real owner out;
//  - ip:   one address trying many accounts or passwords is blocked;
//  - email: a high ceiling across all addresses stops slow distributed guessing.

export type ThrottleKind = "pair" | "ip" | "email";

export interface ThrottleRule {
  maxFailures: number;
  windowMs: number;
  lockMs: number;
}

export const RULES: Record<ThrottleKind, ThrottleRule> = {
  pair: { maxFailures: 5, windowMs: 15 * 60_000, lockMs: 15 * 60_000 },
  ip: { maxFailures: 30, windowMs: 15 * 60_000, lockMs: 30 * 60_000 },
  email: { maxFailures: 50, windowMs: 60 * 60_000, lockMs: 15 * 60_000 },
};

export interface ThrottleState {
  failures: number;
  windowStart: Date;
  lockedUntil: Date | null;
}

export function throttleKeys(email: string, ip: string): Record<ThrottleKind, string> {
  const e = email.trim().toLowerCase();
  return { pair: `pair:${e}|${ip}`, ip: `ip:${ip}`, email: `email:${e}` };
}

/** Milliseconds until the lock lifts, or 0 when not locked. */
export function lockRemaining(state: ThrottleState | null, now: Date): number {
  if (!state?.lockedUntil) return 0;
  return Math.max(0, state.lockedUntil.getTime() - now.getTime());
}

/** State after one more failed attempt. */
export function afterFailure(state: ThrottleState | null, rule: ThrottleRule, now: Date): ThrottleState {
  const fresh = !state || now.getTime() - state.windowStart.getTime() > rule.windowMs || (state.lockedUntil !== null && state.lockedUntil <= now);
  const failures = fresh ? 1 : state.failures + 1;
  const windowStart = fresh ? now : state.windowStart;
  const lockedUntil = failures >= rule.maxFailures ? new Date(now.getTime() + rule.lockMs) : null;
  return { failures, windowStart, lockedUntil };
}

/** Client IP from the proxy headers set by the host (first hop of X-Forwarded-For). */
export function clientIp(headers: { get(name: string): string | null }): string {
  const fwd = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (fwd || headers.get("x-real-ip") || "unknown").slice(0, 64);
}
