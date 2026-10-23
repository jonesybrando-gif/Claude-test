/**
 * A budget line is "not connected" when no ad account is linked to it, or
 * none of its linked accounts has ever synced (demo accounts always count as
 * connected). Such a line has nothing to pace: it is shown in grey and kept
 * out of agency totals, the Daily Action Center and alerts. Unbudgeted rows
 * always come from a linked account, so they never count.
 */
export function isNotConnected(level: string, accts: { lastSuccessfulSyncAt: string | null; isDemo: boolean }[]): boolean {
  if (level === "UNBUDGETED") return false;
  return accts.length === 0 || accts.every((a) => !a.lastSuccessfulSyncAt && !a.isDemo);
}
