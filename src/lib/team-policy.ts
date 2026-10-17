import type { Role } from "./access";

export interface TeamMember {
  id: string;
  role: Role;
  active: boolean;
}

/**
 * Rules for changing someone's role or access. Returns a problem message, or
 * null when allowed. Only agency administrators manage the team.
 */
export function teamChangeProblem(
  actor: { id: string; role: Role },
  target: TeamMember,
  change: { role?: Role; deactivate?: boolean },
  team: TeamMember[],
): string | null {
  if (actor.role !== "AGENCY_ADMIN") return "Only agency administrators can manage the team.";
  const activeAdmins = team.filter((m) => m.role === "AGENCY_ADMIN" && m.active);
  const removesAdmin = target.role === "AGENCY_ADMIN" && target.active && ((change.role && change.role !== "AGENCY_ADMIN") || change.deactivate);
  if (removesAdmin && activeAdmins.length <= 1) return "The agency needs at least one active administrator.";
  if (target.id === actor.id && change.deactivate) return "You can't deactivate your own account.";
  if (target.id === actor.id && change.role && change.role !== actor.role) return "Ask another administrator to change your role.";
  return null;
}

export const ROLE_LABEL: Record<Role, string> = {
  AGENCY_ADMIN: "Agency administrator",
  ACCOUNT_MANAGER: "Account manager",
  CLIENT_USER: "Client (read-only)",
};
