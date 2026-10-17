import "server-only";
import { prisma } from "./db";
import { afterFailure, lockRemaining, RULES, throttleKeys, type ThrottleKind } from "@/lib/login-throttle";

const KINDS: ThrottleKind[] = ["pair", "ip", "email"];

/** Longest remaining lock across the three counters (0 = allowed). */
export async function signInLockRemaining(email: string, ip: string, now = new Date()): Promise<number> {
  const keys = throttleKeys(email, ip);
  const rows = await prisma.loginThrottle.findMany({ where: { key: { in: Object.values(keys) } } });
  return Math.max(0, ...rows.map((r) => lockRemaining(r, now)));
}

export async function recordFailedSignIn(email: string, ip: string, now = new Date()): Promise<void> {
  const keys = throttleKeys(email, ip);
  for (const kind of KINDS) {
    const key = keys[kind];
    const prev = await prisma.loginThrottle.findUnique({ where: { key } });
    const next = afterFailure(prev, RULES[kind], now);
    await prisma.loginThrottle.upsert({ where: { key }, create: { key, ...next }, update: next });
  }
}

/** A successful sign-in clears the counter for that email from that address. */
export async function recordSuccessfulSignIn(email: string, ip: string): Promise<void> {
  await prisma.loginThrottle.deleteMany({ where: { key: throttleKeys(email, ip).pair } });
}
