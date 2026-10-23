import "server-only";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "./db";

// First-run setup (/setup) for a fresh deployment, as a browser alternative to
// `npm run setup:owner`. It is open only while SETUP_TOKEN is set (24+
// characters) and the database has no users; after that it's a 404.

const token = () => process.env.SETUP_TOKEN ?? "";

export async function setupAvailable(): Promise<boolean> {
  return token().length >= 24 && (await prisma.user.count()) === 0;
}

export function setupTokenMatches(given: string): boolean {
  const expected = Buffer.from(token());
  const got = Buffer.from(given);
  return expected.length >= 24 && got.length === expected.length && timingSafeEqual(got, expected);
}

export interface SetupStep {
  key: string;
  title: string;
  body: string;
  href: string;
  done: boolean;
}

/** The first-run checklist for a new agency, with each step's state worked out from its data. */
export async function setupChecklist(agencyId: string): Promise<SetupStep[]> {
  const [clients, connections, linked, budgets, agency, team] = await Promise.all([
    prisma.client.count({ where: { agencyId, archivedAt: null } }),
    prisma.platformConnection.count({ where: { agencyId, status: { not: "DISCONNECTED" } } }),
    prisma.adAccount.count({ where: { client: { agencyId }, isDemo: false, connectionId: { not: null } } }),
    prisma.budget.count({ where: { client: { agencyId } } }),
    prisma.agency.findUniqueOrThrow({ where: { id: agencyId }, select: { logoUrl: true, brandColor: true } }),
    prisma.user.count({ where: { agencyId, deactivatedAt: null } }),
  ]);
  return [
    { key: "client", title: "Add a client", body: "Create a client with its reporting time zone.", href: "/clients", done: clients > 0 },
    { key: "platform", title: "Connect an ad platform", body: "Sign in to Google Ads, Meta or Microsoft Advertising.", href: "/integrations", done: connections > 0 },
    { key: "accounts", title: "Link ad accounts", body: "Link each client's ad account; history imports automatically.", href: "/clients", done: linked > 0 },
    { key: "budgets", title: "Set monthly budgets", body: "Open a client, then Setup → Budgets. Pacing and alerts start here.", href: "/clients", done: budgets > 0 },
    { key: "branding", title: "Add your branding", body: "Logo and colour for client reports and shared links.", href: "/settings", done: !!agency.logoUrl || agency.brandColor.toLowerCase() !== "#4f46e5" },
    { key: "team", title: "Invite your team", body: "Add account managers and client logins.", href: "/settings/team", done: team > 1 },
  ];
}
