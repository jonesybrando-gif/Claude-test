/**
 * Demo data seed. Every account and performance row is flagged isDemo=true and
 * the UI labels it as demo data. Run: npm run db:seed
 *
 * Data is generated relative to the current date so the current month always
 * has realistic month-to-date pacing.
 */
import { PrismaClient, type Platform, type DistributionMode } from "@prisma/client";
import bcrypt from "bcryptjs";
import { addDays, dayOfWeek, eachDay, isoToDate, monthBounds, todayInTimeZone, type IsoDate } from "../src/lib/pacing/dates";

const prisma = new PrismaClient();
const TZ = "America/New_York";
const DEMO_PASSWORD = "demo-password";

// Deterministic PRNG (mulberry32) so the seed is reproducible for a given day.
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface PlatformProfile {
  cpc: number; // dollars
  ctr: number;
  cvr: number;
  aov: number; // conversion value per conversion, dollars
  leadCost?: number;
}

const PROFILE: Record<Platform, PlatformProfile> = {
  GOOGLE_ADS: { cpc: 6.5, ctr: 0.055, cvr: 0.09, aov: 420 },
  META_ADS: { cpc: 1.4, ctr: 0.012, cvr: 0.035, aov: 260 },
  MICROSOFT_ADS: { cpc: 4.2, ctr: 0.045, cvr: 0.08, aov: 380 },
  GOOGLE_LSA: { cpc: 0, ctr: 0, cvr: 0, aov: 0, leadCost: 38 },
};

interface AccountSpec {
  platform: Platform;
  name: string;
  campaigns: { name: string; share: number; budget?: number; status?: "ENABLED" | "PAUSED" }[];
  budget?: number; // monthly account budget, dollars
  factor: number; // current-month spend multiplier vs plan
  stale?: boolean;
  disconnected?: boolean;
  stopDaysAgo?: number; // spend stops this many days before today
}

interface ClientSpec {
  name: string;
  manager: "am1" | "am2";
  clientBudget?: number;
  distribution?: DistributionMode;
  midMonthChange?: { day: number; from: number };
  accounts: AccountSpec[];
}

const CLIENTS: ClientSpec[] = [
  {
    name: "ABC Plumbing",
    manager: "am1",
    accounts: [{ platform: "GOOGLE_ADS", name: "ABC Plumbing – Search", budget: 5000, factor: 1.28, campaigns: [
      { name: "Search – Emergency Plumbing", share: 0.5 },
      { name: "Search – Water Heaters", share: 0.3 },
      { name: "Performance Max – Services", share: 0.2 },
    ] }],
  },
  {
    name: "Dental Group",
    manager: "am1",
    accounts: [{ platform: "META_ADS", name: "Dental Group – Meta", budget: 8000, factor: 0.725, campaigns: [
      { name: "Lead Gen – Implants", share: 0.6 },
      { name: "Retargeting – Site Visitors", share: 0.4 },
    ] }],
  },
  {
    name: "Roofing Co.",
    manager: "am1",
    accounts: [{ platform: "MICROSOFT_ADS", name: "Roofing Co. – Bing", budget: 4000, factor: 1.0, campaigns: [
      { name: "Roof Repair – Exact", share: 0.65 },
      { name: "Roof Replacement – Broad", share: 0.35 },
    ] }],
  },
  {
    name: "Home Services",
    manager: "am1",
    accounts: [{ platform: "GOOGLE_LSA", name: "Home Services – LSA", budget: 5000, factor: 0.96, campaigns: [] }],
  },
  {
    name: "Bright Smile Orthodontics",
    manager: "am1",
    clientBudget: 12000,
    accounts: [
      { platform: "GOOGLE_ADS", name: "Bright Smile – Google", factor: 1.08, campaigns: [
        { name: "Search – Invisalign", share: 0.7 },
        { name: "Search – Braces", share: 0.3 },
      ] },
      { platform: "META_ADS", name: "Bright Smile – Meta", factor: 1.08, campaigns: [{ name: "Awareness – Local", share: 1 }] },
    ],
  },
  {
    name: "Summit HVAC",
    manager: "am1",
    midMonthChange: { day: 10, from: 6000 },
    accounts: [{ platform: "GOOGLE_ADS", name: "Summit HVAC – Google", budget: 7500, factor: 0.9, campaigns: [
      { name: "Search – AC Repair", share: 0.55 },
      { name: "Search – Furnace", share: 0.45 },
    ] }],
  },
  {
    name: "Lakeside Law",
    manager: "am2",
    distribution: "BUSINESS_DAYS",
    accounts: [{ platform: "GOOGLE_ADS", name: "Lakeside Law – Google", budget: 6000, factor: 1.0, campaigns: [
      { name: "Search – Personal Injury", share: 0.8 },
      { name: "Search – Brand", share: 0.2 },
    ] }],
  },
  {
    name: "Metro Auto Repair",
    manager: "am2",
    accounts: [{ platform: "GOOGLE_ADS", name: "Metro Auto – Google", factor: 1.12, campaigns: [
      { name: "Search – Brakes", share: 0.45, budget: 1800 },
      { name: "Search – Oil Change", share: 0.35, budget: 1400 },
      { name: "Display – Remarketing", share: 0.2 },
    ] }],
  },
  {
    name: "Green Lawn Care",
    manager: "am2",
    accounts: [{ platform: "META_ADS", name: "Green Lawn – Meta", budget: 3000, factor: 1.0, stale: true, campaigns: [
      { name: "Lead Gen – Spring Promo", share: 1 },
    ] }],
  },
  {
    name: "Peak Fitness",
    manager: "am2",
    accounts: [{ platform: "MICROSOFT_ADS", name: "Peak Fitness – Bing", budget: 2500, factor: 0.6, disconnected: true, campaigns: [
      { name: "Search – Memberships", share: 1 },
    ] }],
  },
  {
    name: "Coastal Realty",
    manager: "am2",
    accounts: [
      { platform: "GOOGLE_ADS", name: "Coastal Realty – Google", factor: 1, campaigns: [{ name: "Search – Listings", share: 1 }] },
    ],
  },
  {
    name: "Elite Chiropractic",
    manager: "am2",
    accounts: [{ platform: "GOOGLE_ADS", name: "Elite Chiro – Google", budget: 3500, factor: 1.0, stopDaysAgo: 4, campaigns: [
      { name: "Search – Back Pain", share: 1, status: "PAUSED" },
    ] }],
  },
];

const dollars = (n: number) => BigInt(Math.round(n * 100));

async function main() {
  const now = new Date();
  const today = todayInTimeZone(TZ, now);
  const yesterday = addDays(today, -1);
  const cur = monthBounds(today);
  const months: { start: IsoDate; end: IsoDate }[] = [];
  {
    let m = cur;
    for (let i = 0; i < 4; i++) {
      months.unshift(m);
      m = monthBounds(addDays(m.start, -1));
    }
  }

  console.log("Resetting demo agency…");
  await prisma.agency.deleteMany({ where: { slug: "demo-agency" } });

  const agency = await prisma.agency.create({
    data: { name: "Northstar Digital (Demo)", slug: "demo-agency", brandColor: "#4f46e5", defaultTimezone: TZ },
  });
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const admin = await prisma.user.create({ data: { agencyId: agency.id, email: "admin@demo.test", name: "Alex Rivera", role: "AGENCY_ADMIN", passwordHash: hash } });
  const am1 = await prisma.user.create({ data: { agencyId: agency.id, email: "manager@demo.test", name: "Morgan Chen", role: "ACCOUNT_MANAGER", passwordHash: hash } });
  const am2 = await prisma.user.create({ data: { agencyId: agency.id, email: "jordan@demo.test", name: "Jordan Patel", role: "ACCOUNT_MANAGER", passwordHash: hash } });
  const managers = { am1, am2 };

  const connections: Partial<Record<Platform, string>> = {};
  for (const p of ["GOOGLE_ADS", "META_ADS", "MICROSOFT_ADS", "GOOGLE_LSA"] as Platform[]) {
    const c = await prisma.platformConnection.create({ data: { agencyId: agency.id, platform: p, label: `Demo ${p} connection`, status: "ACTIVE" } });
    connections[p] = c.id;
  }

  let seed = 1;
  for (const spec of CLIENTS) {
    const client = await prisma.client.create({
      data: { agencyId: agency.id, name: spec.name, timezone: TZ, currency: "USD", primaryManagerId: managers[spec.manager].id },
    });
    await prisma.clientAssignment.create({ data: { userId: managers[spec.manager].id, clientId: client.id } });
    if (spec.name === "ABC Plumbing") {
      await prisma.user.create({ data: { agencyId: agency.id, email: "client@demo.test", name: "Pat Owner (ABC Plumbing)", role: "CLIENT_USER", clientId: client.id, passwordHash: hash } });
    }

    if (spec.clientBudget) {
      for (const m of months) {
        await prisma.budget.create({
          data: {
            clientId: client.id, scope: "CLIENT", periodStart: isoToDate(m.start), periodEnd: isoToDate(m.end), currency: "USD",
            revisions: { create: [{ amountMinor: dollars(spec.clientBudget), effectiveDate: isoToDate(m.start), createdById: admin.id }] },
          },
        });
      }
    }

    for (const [ai, a] of spec.accounts.entries()) {
      const r = rng(seed++ * 7919);
      const lastSync = a.stale ? new Date(now.getTime() - 3 * 86_400_000) : new Date(now.getTime() - 40 * 60_000);
      const completeThrough = a.stale ? addDays(today, -4) : yesterday;
      const account = await prisma.adAccount.create({
        data: {
          clientId: client.id,
          connectionId: connections[a.platform],
          platform: a.platform,
          externalId: `demo-${seed}-${ai}`,
          name: a.name,
          currency: "USD",
          timezone: TZ,
          isDemo: true,
          spendIsVerified: a.platform !== "GOOGLE_LSA",
          status: a.disconnected ? "NEEDS_REAUTH" : "ACTIVE",
          lastSyncAttemptAt: now,
          lastSuccessfulSyncAt: a.disconnected ? new Date(now.getTime() - 30 * 3_600_000) : lastSync,
          dataCompleteThrough: isoToDate(a.disconnected ? addDays(today, -2) : completeThrough),
        },
      });

      await prisma.syncRun.create({
        data: a.disconnected
          ? { accountId: account.id, kind: "scheduled", status: "FAILED", error: "Demo: OAuth refresh token was revoked (invalid_grant). Reconnect required.", startedAt: now, finishedAt: now }
          : { accountId: account.id, kind: "scheduled", status: "SUCCEEDED", rowsUpserted: 0, startedAt: lastSync, finishedAt: lastSync },
      });

      const campaigns = [];
      for (const [ci, c] of a.campaigns.entries()) {
        campaigns.push({
          spec: c,
          row: await prisma.campaign.create({ data: { accountId: account.id, externalId: `demo-cmp-${seed}-${ci}`, name: c.name, status: c.status ?? "ENABLED" } }),
        });
      }

      // Budgets for each month
      const accountBudget = a.budget;
      for (const m of months) {
        const isCurrent = m.start === cur.start;
        if (accountBudget) {
          const revisions =
            isCurrent && spec.midMonthChange
              ? [
                  { amountMinor: dollars(spec.midMonthChange.from), effectiveDate: isoToDate(m.start), note: "Initial budget" },
                  { amountMinor: dollars(accountBudget), effectiveDate: isoToDate(addDays(m.start, spec.midMonthChange.day - 1)), note: "Client approved increase" },
                ]
              : [{ amountMinor: dollars(accountBudget), effectiveDate: isoToDate(m.start) }];
          await prisma.budget.create({
            data: {
              clientId: client.id, scope: "ACCOUNT", accountId: account.id, periodStart: isoToDate(m.start), periodEnd: isoToDate(m.end), currency: "USD",
              distribution: spec.distribution ?? "EVEN",
              revisions: { create: revisions.map((rv) => ({ ...rv, createdById: am1.id })) },
            },
          });
        }
        for (const c of campaigns) {
          if (!c.spec.budget) continue;
          await prisma.budget.create({
            data: {
              clientId: client.id, scope: "CAMPAIGN", accountId: account.id, campaignId: c.row.id, periodStart: isoToDate(m.start), periodEnd: isoToDate(m.end), currency: "USD",
              revisions: { create: [{ amountMinor: dollars(c.spec.budget), effectiveDate: isoToDate(m.start) }] },
            },
          });
        }
      }

      // Daily performance
      const monthlyPlan = accountBudget ?? (spec.clientBudget ? spec.clientBudget / spec.accounts.length : a.campaigns.reduce((s, c) => s + (c.budget ?? 0), 0) / 0.8 || 4000);
      const prof = PROFILE[a.platform];
      const rows = [];
      for (const m of months) {
        const isCurrent = m.start === cur.start;
        const days = eachDay(m.start, m.end);
        const factor = isCurrent ? a.factor : 0.9 + r() * 0.2;
        const business = spec.distribution === "BUSINESS_DAYS";
        const activeDays = business ? days.filter((d) => dayOfWeek(d) % 6 !== 0).length : days.length;
        let budgetForDay = (d: IsoDate) => monthlyPlan / activeDays;
        if (isCurrent && spec.midMonthChange) {
          const changeDate = addDays(m.start, spec.midMonthChange.day - 1);
          const before = spec.midMonthChange.from / days.length;
          const remainingBudget = (accountBudget ?? 0) - before * (spec.midMonthChange.day - 1);
          const after = remainingBudget / (days.length - spec.midMonthChange.day + 1);
          budgetForDay = (d) => (d < changeDate ? before : after);
        }
        const endDate = isCurrent ? (a.stale ? addDays(today, -4) : a.disconnected ? addDays(today, -2) : yesterday) : m.end;
        for (const d of days) {
          if (d > endDate) break;
          if (business && dayOfWeek(d) % 6 === 0) continue;
          if (isCurrent && a.stopDaysAgo && d >= addDays(today, -a.stopDaysAgo)) continue;
          const daily = budgetForDay(d) * factor * (0.85 + r() * 0.3);
          const targets = campaigns.length ? campaigns.map((c) => ({ id: c.row.id, share: c.spec.share })) : [{ id: null as string | null, share: 1 }];
          for (const t of targets) {
            const cost = daily * t.share;
            if (a.platform === "GOOGLE_LSA") {
              const leads = Math.max(0, Math.round(cost / prof.leadCost!));
              rows.push({ accountId: account.id, campaignId: null, date: isoToDate(d), currency: "USD", costMinor: dollars(leads * prof.leadCost!), costIsEstimated: true, leads, conversions: leads, isDemo: true });
              continue;
            }
            const clicks = Math.max(0, Math.round((cost / prof.cpc) * (0.9 + r() * 0.2)));
            const impressions = Math.round(clicks / prof.ctr);
            const conversions = Math.round(clicks * prof.cvr * (0.7 + r() * 0.6) * 100) / 100;
            rows.push({
              accountId: account.id,
              campaignId: t.id,
              date: isoToDate(d),
              currency: "USD",
              costMinor: dollars(cost),
              impressions: BigInt(impressions),
              clicks: BigInt(clicks),
              reach: a.platform === "META_ADS" ? BigInt(Math.round(impressions * 0.62)) : null,
              conversions,
              conversionValueMinor: dollars(conversions * prof.aov),
              leads: a.platform === "META_ADS" ? Math.round(conversions) : null,
              isDemo: true,
            });
          }
        }
      }
      await prisma.dailyPerformance.createMany({ data: rows });
    }
  }

  const counts = await Promise.all([prisma.client.count(), prisma.adAccount.count(), prisma.dailyPerformance.count()]);
  console.log(`Seeded ${counts[0]} clients, ${counts[1]} accounts, ${counts[2]} daily rows (all demo).`);
  console.log(`Logins (password "${DEMO_PASSWORD}"): admin@demo.test, manager@demo.test, jordan@demo.test, client@demo.test`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
