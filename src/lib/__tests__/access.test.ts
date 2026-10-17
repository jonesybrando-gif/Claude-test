import { describe, expect, it } from "vitest";
import { canEditClient, canManageAgency, canViewAgencyDashboard, canViewClient, type SessionUser } from "../access";

const user = (role: SessionUser["role"], extra: Partial<SessionUser> = {}): SessionUser => ({
  id: "u1",
  agencyId: "agencyA",
  role,
  clientId: null,
  name: "n",
  email: "e",
  ...extra,
});

const clientA1 = { id: "c1", agencyId: "agencyA", primaryManagerId: "u1", assignedUserIds: [] };
const clientA2 = { id: "c2", agencyId: "agencyA", primaryManagerId: "other", assignedUserIds: ["u1"] };
const clientA3 = { id: "c3", agencyId: "agencyA", primaryManagerId: "other", assignedUserIds: [] };
const clientB = { id: "c9", agencyId: "agencyB", primaryManagerId: "u1", assignedUserIds: ["u1"] };

describe("access policy", () => {
  it("admins see every client in their agency but never another agency's", () => {
    const admin = user("AGENCY_ADMIN");
    expect([clientA1, clientA2, clientA3].every((c) => canViewClient(admin, c))).toBe(true);
    expect(canViewClient(admin, clientB)).toBe(false);
    expect(canManageAgency(admin)).toBe(true);
  });

  it("account managers see only primary or assigned clients", () => {
    const am = user("ACCOUNT_MANAGER");
    expect(canViewClient(am, clientA1)).toBe(true);
    expect(canViewClient(am, clientA2)).toBe(true);
    expect(canViewClient(am, clientA3)).toBe(false);
    expect(canViewClient(am, clientB)).toBe(false);
    expect(canEditClient(am, clientA1)).toBe(true);
    expect(canManageAgency(am)).toBe(false);
  });

  it("client users are read-only and limited to their own client", () => {
    const cu = user("CLIENT_USER", { clientId: "c1" });
    expect(canViewClient(cu, clientA1)).toBe(true);
    expect(canViewClient(cu, clientA2)).toBe(false);
    expect(canViewClient(cu, { ...clientB, id: "c1" })).toBe(false); // same id, other agency
    expect(canEditClient(cu, clientA1)).toBe(false);
    expect(canViewAgencyDashboard(cu)).toBe(false);
  });
});
