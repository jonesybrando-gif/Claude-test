export type OrphanAccount = { id: string; clientId: string; platform: string; externalId: string; connectionId: string; status: string };
export type ReachableAccount = { externalId: string; isManager: boolean; loginCustomerId?: string | null };
export type Reattachment = { accountId: string; loginCustomerId: string | null };

/** Which orphaned accounts a connection can take over: same external id, reachable, not a manager. */
export function pickReattachments(orphans: OrphanAccount[], reachable: ReachableAccount[], connectionId: string): Reattachment[] {
  const byId = new Map(reachable.filter((a) => !a.isManager).map((a) => [a.externalId, a]));
  const out: Reattachment[] = [];
  for (const o of orphans) {
    const r = byId.get(o.externalId);
    if (!r) continue;
    if (o.connectionId === connectionId && o.status === "ACTIVE") continue;
    out.push({ accountId: o.id, loginCustomerId: r.loginCustomerId ?? null });
  }
  return out;
}
