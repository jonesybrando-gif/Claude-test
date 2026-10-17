// Role-based access policy. Pure functions so the rules can be unit-tested;
// src/server/access.ts turns them into database filters.

export type Role = "AGENCY_ADMIN" | "ACCOUNT_MANAGER" | "CLIENT_USER";

export interface SessionUser {
  id: string;
  agencyId: string;
  role: Role;
  /** CLIENT_USER only */
  clientId: string | null;
  name: string;
  email: string;
}

export interface ClientAccessFacts {
  id: string;
  agencyId: string;
  primaryManagerId: string | null;
  assignedUserIds: string[];
}

export function canViewClient(user: SessionUser, client: ClientAccessFacts): boolean {
  if (client.agencyId !== user.agencyId) return false; // strict agency isolation
  switch (user.role) {
    case "AGENCY_ADMIN":
      return true;
    case "ACCOUNT_MANAGER":
      return client.primaryManagerId === user.id || client.assignedUserIds.includes(user.id);
    case "CLIENT_USER":
      return user.clientId === client.id;
  }
}

/** Budgets, client records and thresholds. Client users are read-only. */
export function canEditClient(user: SessionUser, client: ClientAccessFacts): boolean {
  return user.role !== "CLIENT_USER" && canViewClient(user, client);
}

export function canManageAgency(user: SessionUser): boolean {
  return user.role === "AGENCY_ADMIN";
}

/** Internal operational views (agency dashboard, action center, integrations). */
export function canViewAgencyDashboard(user: SessionUser): boolean {
  return user.role !== "CLIENT_USER";
}
