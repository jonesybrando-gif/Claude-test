import { describe, expect, it } from "vitest";
import { teamChangeProblem, type TeamMember } from "../team-policy";
import { passwordProblems } from "../password";

const admin = { id: "a1", role: "AGENCY_ADMIN" as const };
const team = (extraAdmins = 0): TeamMember[] => [
  { id: "a1", role: "AGENCY_ADMIN", active: true },
  ...Array.from({ length: extraAdmins }, (_, i) => ({ id: `a${i + 2}`, role: "AGENCY_ADMIN" as const, active: true })),
  { id: "m1", role: "ACCOUNT_MANAGER", active: true },
];

describe("team policy", () => {
  it("only admins manage the team", () => {
    expect(teamChangeProblem({ id: "m1", role: "ACCOUNT_MANAGER" }, team()[1], { deactivate: true }, team())).toMatch(/Only agency administrators/);
  });

  it("keeps at least one active administrator", () => {
    expect(teamChangeProblem({ id: "x", role: "AGENCY_ADMIN" }, team()[0], { role: "ACCOUNT_MANAGER" }, team())).toMatch(/at least one/);
    expect(teamChangeProblem(admin, { id: "a2", role: "AGENCY_ADMIN", active: true }, { role: "ACCOUNT_MANAGER" }, team(1))).toBeNull();
  });

  it("admins can't lock themselves out", () => {
    expect(teamChangeProblem(admin, team(1)[0], { deactivate: true }, team(1))).toMatch(/your own account/);
    expect(teamChangeProblem(admin, team(1)[0], { role: "ACCOUNT_MANAGER" }, team(1))).toMatch(/another administrator/);
  });

  it("allows ordinary changes", () => {
    expect(teamChangeProblem(admin, team()[1], { role: "AGENCY_ADMIN" }, team())).toBeNull();
    expect(teamChangeProblem(admin, team()[1], { deactivate: true }, team())).toBeNull();
  });
});

describe("password rules", () => {
  it("rejects weak passwords", () => {
    expect(passwordProblems("short1")).not.toEqual([]);
    expect(passwordProblems("onlyletterslong")).not.toEqual([]);
    expect(passwordProblems("12345678901")).not.toEqual([]);
    expect(passwordProblems("alexrivera-2026", "alexrivera@agency.com")).not.toEqual([]);
    expect(passwordProblems("correct-horse-42")).toEqual([]);
  });
});
