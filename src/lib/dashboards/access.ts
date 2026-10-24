// Who may see and change custom dashboards. Pure so the rules are unit-tested;
// src/server/dashboards/access.ts loads the facts and applies them.

import { canEditClient, canViewClient, type ClientAccessFacts, type SessionUser } from "@/lib/access";

export interface DashboardFacts {
  agencyId: string;
  clientId: string | null;
  isTemplate: boolean;
  clientVisible: boolean;
}

/** Agency templates (no client) are managed by agency admins only. */
export function canManageDashboardTemplates(user: SessionUser): boolean {
  return user.role === "AGENCY_ADMIN";
}

/**
 * Staff who may edit the client may edit its dashboards. Templates need an
 * admin. `client` is the dashboard's client (null for templates).
 */
export function canEditDashboard(user: SessionUser, d: DashboardFacts, client: ClientAccessFacts | null): boolean {
  if (d.agencyId !== user.agencyId) return false;
  if (d.isTemplate || !d.clientId) return canManageDashboardTemplates(user);
  if (!client || client.id !== d.clientId || client.agencyId !== d.agencyId) return false;
  return canEditClient(user, client);
}

/** Staff who can see the client see all its dashboards; client logins only client-visible ones. */
export function canViewDashboard(user: SessionUser, d: DashboardFacts, client: ClientAccessFacts | null): boolean {
  if (d.agencyId !== user.agencyId) return false;
  if (d.isTemplate || !d.clientId) return user.role !== "CLIENT_USER";
  if (!client || client.id !== d.clientId || client.agencyId !== d.agencyId) return false;
  if (!canViewClient(user, client)) return false;
  return user.role !== "CLIENT_USER" || d.clientVisible;
}

/** Shared report links show only the link's client's client-visible, non-template dashboards. */
export function sharedReportShows(d: Pick<DashboardFacts, "clientId" | "isTemplate" | "clientVisible">, linkClientId: string): boolean {
  return !d.isTemplate && d.clientVisible && d.clientId === linkClientId;
}
