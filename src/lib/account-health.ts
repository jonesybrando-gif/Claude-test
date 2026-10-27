/**
 * Whether an ad account counts as disconnected. An account someone stopped
 * tracking, or replaced with another account on the client's Ad accounts page,
 * keeps its history but has no connection: it is retired, not broken, so it
 * must not raise "Ad account disconnected".
 */
export function isAccountDisconnected(a: { status: string; connectionId?: string | null; isDemo?: boolean; monitored?: boolean }): boolean {
  if (a.status !== "DISCONNECTED" && a.status !== "NEEDS_REAUTH") return false;
  const monitored = a.monitored ?? (!!a.isDemo || !!a.connectionId);
  return monitored;
}

/** Retired: kept for history only, no longer synced (stopped tracking or replaced). */
export function isAccountRetired(a: { status: string; connectionId?: string | null; isDemo?: boolean }): boolean {
  return !a.isDemo && !a.connectionId && a.status === "DISCONNECTED";
}
