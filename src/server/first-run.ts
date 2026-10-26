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

export interface SetupChecklistState {
  steps: SetupStep[];
  /** Agency.setupChecklistDismissedAt is set: an admin hid it for everyone. */
  dismissed: boolean;
}

/**
 * The first-run checklist for a new agency, with each step's state worked out
 * from its data. Per-client steps link to the first client still missing them.
 */
export async function setupChecklist(agencyId: string): Promise<SetupChecklistState> {
  const live = { agencyId, archivedAt: null };
  const [clients, connections, agency, team, shares, schedules] = await Promise.all([
    prisma.client.findMany({
      where: live,
      select: { id: true, accounts: { where: { isDemo: false, connectionId: { not: null } }, select: { id: true }, take: 1 }, budgets: { select: { id: true }, take: 1 } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.platformConnection.count({ where: { agencyId, status: { not: "DISCONNECTED" } } }),
    prisma.agency.findUniqueOrThrow({ where: { id: agencyId }, select: { logoUrl: true, brandColor: true, setupChecklistDismissedAt: true } }),
    prisma.user.count({ where: { agencyId, deactivatedAt: null } }),
    prisma.reportShareLink.count({ where: { client: { agencyId } } }),
    prisma.reportSchedule.count({ where: { report: { agencyId } } }),
  ]);
  const linkedClients = clients.filter((c) => c.accounts.length > 0);
  const needsAccounts = clients.find((c) => c.accounts.length === 0);
  // Budgets and sharing make most sense on a client whose accounts are linked.
  const needsBudget = linkedClients.find((c) => c.budgets.length === 0) ?? clients.find((c) => c.budgets.length === 0);
  const shareClient = linkedClients[0] ?? clients[0];
  const steps: SetupStep[] = [
    { key: "client", title: "Add a client", body: "Create a client with its reporting time zone.", href: "/clients?new=1", done: clients.length > 0 },
    { key: "platform", title: "Connect an ad platform", body: "Sign in to Google Ads, Meta or Microsoft Advertising.", href: "/integrations", done: connections > 0 },
    {
      key: "accounts",
      title: "Link ad accounts",
      body: "Link each client's ad account; history imports automatically.",
      href: needsAccounts ? `/clients/${needsAccounts.id}/accounts` : "/clients",
      done: linkedClients.length > 0,
    },
    { key: "budgets", title: "Set a monthly budget", body: "Pacing, the Daily Action Center and alerts start here.", href: needsBudget ? `/clients/${needsBudget.id}/budgets` : "/clients", done: clients.some((c) => c.budgets.length > 0) },
    { key: "share", title: "Share your first report", body: "Send a client a live report link or schedule a monthly email.", href: shareClient ? `/clients/${shareClient.id}/share` : "/clients", done: shares + schedules > 0 },
    { key: "branding", title: "Add your branding", body: "Logo and colour for client reports and shared links.", href: "/settings", done: !!agency.logoUrl || agency.brandColor.toLowerCase() !== "#4f46e5" },
    { key: "team", title: "Invite your team", body: "Add account managers and client logins.", href: "/settings/team", done: team > 1 },
  ];
  return { steps, dismissed: !!agency.setupChecklistDismissedAt };
}
