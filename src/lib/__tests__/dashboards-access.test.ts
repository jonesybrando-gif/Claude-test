import { describe, expect, it } from "vitest";
import type { SessionUser } from "@/lib/access";
import { canEditDashboard, canManageDashboardTemplates, canViewDashboard, sharedReportShows } from "@/lib/dashboards/access";

const user = (role: SessionUser["role"], extra: Partial<SessionUser> = {}): SessionUser => ({ id: "u1", agencyId: "ag", role, clientId: null, name: "U", email: "u@x", ...extra });
const admin = user("AGENCY_ADMIN");
const assigned = user("ACCOUNT_MANAGER");
const unassigned = user("ACCOUNT_MANAGER", { id: "u2" });
const clientUser = user("CLIENT_USER", { id: "cu", clientId: "c1" });
const otherClientUser = user("CLIENT_USER", { id: "cu2", clientId: "c2" });
const otherAgencyAdmin = user("AGENCY_ADMIN", { agencyId: "other" });

const client = { id: "c1", agencyId: "ag", primaryManagerId: "u1", assignedUserIds: [] };
const dash = (extra: Partial<{ clientVisible: boolean; isTemplate: boolean; clientId: string | null; agencyId: string }> = {}) => ({ agencyId: "ag", clientId: "c1", isTemplate: false, clientVisible: true, ...extra });
const template = dash({ isTemplate: true, clientId: null });

describe("dashboard permissions", () => {
  it("lets staff who can edit the client edit its dashboards", () => {
    expect(canEditDashboard(admin, dash(), client)).toBe(true);
    expect(canEditDashboard(assigned, dash(), client)).toBe(true);
    expect(canEditDashboard(unassigned, dash(), client)).toBe(false);
    expect(canEditDashboard(clientUser, dash(), client)).toBe(false);
    expect(canEditDashboard(otherAgencyAdmin, dash(), client)).toBe(false);
  });

  it("never mixes a dashboard with another client's access facts", () => {
    expect(canEditDashboard(admin, dash({ clientId: "c9" }), client)).toBe(false);
    expect(canViewDashboard(admin, dash(), null)).toBe(false);
  });

  it("shows client logins only their own client-visible dashboards", () => {
    expect(canViewDashboard(clientUser, dash(), client)).toBe(true);
    expect(canViewDashboard(clientUser, dash({ clientVisible: false }), client)).toBe(false);
    expect(canViewDashboard(otherClientUser, dash(), client)).toBe(false);
    expect(canViewDashboard(assigned, dash({ clientVisible: false }), client)).toBe(true);
    expect(canViewDashboard(unassigned, dash(), client)).toBe(false);
  });

  it("restricts agency templates to admins (editing) and staff (viewing)", () => {
    expect(canManageDashboardTemplates(admin)).toBe(true);
    expect(canManageDashboardTemplates(assigned)).toBe(false);
    expect(canEditDashboard(admin, template, null)).toBe(true);
    expect(canEditDashboard(assigned, template, null)).toBe(false);
    expect(canEditDashboard(otherAgencyAdmin, template, null)).toBe(false);
    expect(canViewDashboard(assigned, template, null)).toBe(true);
    expect(canViewDashboard(clientUser, template, null)).toBe(false);
  });

  it("shared reports show only the link client's visible, non-template dashboards", () => {
    expect(sharedReportShows(dash(), "c1")).toBe(true);
    expect(sharedReportShows(dash({ clientVisible: false }), "c1")).toBe(false);
    expect(sharedReportShows(dash(), "c2")).toBe(false);
    expect(sharedReportShows(template, "c1")).toBe(false);
  });
});
