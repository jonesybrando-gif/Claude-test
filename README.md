# Budget Pacing Monitor

A multi-tenant advertising reporting and **budget pacing** app for agencies. Enter each client's monthly budget, and the app works out whether campaigns are spending too fast, too slow, or on target, forecasts month-end spend, and tells account managers exactly what daily spend to aim for.

> **Status: Phase 1 (core application) is built and tested with demo data. No live ad-platform integration is connected yet.** All sample data is flagged `isDemo` and labelled "Demo data" in the UI. See [What's built and what isn't](#whats-built-and-what-isnt).

## Quick start

Requirements: Node.js 20+, PostgreSQL 14+.

```bash
npm install
cp .env.example .env          # then fill in the three values (see below)
npx prisma migrate deploy     # create tables
npm run db:seed               # load the demo agency (12 clients, 13 accounts, 4 months of daily data)
npm run dev                   # http://localhost:3000
```

`.env`:

| Variable | What it is |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `AUTH_SECRET` | Random secret for signing session cookies: `openssl rand -base64 32` |
| `TOKEN_ENCRYPTION_KEY` | 32-byte key for encrypting OAuth tokens at rest: `openssl rand -base64 32` |
| `SHOW_DEMO_LOGINS` | Optional. `1` shows the demo login hints on the sign-in page in production |

Demo logins (password `demo-password`):

| Email | Role | Sees |
|---|---|---|
| admin@demo.test | Agency administrator | Everything, plus Settings |
| manager@demo.test | Account manager | Their 6 assigned clients |
| jordan@demo.test | Account manager | The other 6 clients |
| client@demo.test | Client user | ABC Plumbing's reports, read-only |

The demo data is generated relative to today, so the current month always has realistic month-to-date pacing. It covers: overspending, underspending, on target, a combined Google + Meta client budget, a mid-month budget increase, business-days-only pacing, campaign-only budgets, a stale sync, a disconnected account, spend that suddenly stopped, an unbudgeted client, and estimated LSA spend.

## Commands

| Command | |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / server |
| `npm test` | Unit tests (pacing engine, roll-ups, permissions, recommendations, validation) |
| `npm run typecheck` | TypeScript |
| `npm run lint` | ESLint |
| `npm run db:seed` | Reset and reload the demo agency |

## How pacing works

All money is integer minor units (cents). Floating-point dollars are never stored or summed.

For a calendar-month budget:

```
Expected spend to date    = Monthly budget × (Elapsed days ÷ Days in month)
Pacing %                  = Actual spend to date ÷ Expected spend to date × 100
Projected month-end spend = Actual spend to date ÷ Elapsed days × Days in month
Projected variance        = Projected month-end spend − Monthly budget
Required daily spend      = (Budget − Actual spend) ÷ Remaining days
```

**Pacing % is actual ÷ expected, not the share of the budget used.** The UI shows both, labelled separately.

The engine (`src/lib/pacing/engine.ts`) generalises these formulas:

- **Partial days.** Pacing runs through the last *complete* day of data, normally yesterday in the client's timezone. Today's partial spend is excluded so it never makes an account look under-paced. If an account's data is only complete through an earlier date, pacing stops there and the row is flagged.
- **Timezones.** Each client has its own reporting timezone. Date arithmetic uses calendar dates, so DST changes can't shift a day.
- **Distributions.** Spend can be planned evenly across all days, on business days only, weekend-weighted, by custom weekday weights, or by custom per-date weights (seasonal patterns). Planned pauses get zero planned spend.
- **Mid-period budget changes.** A revision re-spreads whatever budget remains over the remaining planned days. The plan line stays continuous and always ends exactly at the new budget.
- **Forecast models.** Straight-line (month-to-date average) or trailing 7-day trend.
- **Two statuses.** *Pacing status* compares spend to date with the plan. *Forecast status* compares projected month-end spend with the budget. Recommendations act on whichever is further off. Without this, an account that was on plan before a mid-month increase would read "on target" while heading for a large underspend.
- **Thresholds** are configurable per agency (and stored per client for overrides). Defaults: <85% underspending · 85–95% slightly under · 95–105% on target · >105–115% slightly over · >115% overspending.

### Budget levels without double counting

Budgets can be set for a whole client (across platforms), for an advertising account, or for a campaign (`src/lib/pacing/rollup.ts`):

1. A client budget, if present, is the client total and is paced against all of the client's spend.
2. Otherwise each account contributes its account budget, or the sum of its campaign budgets.
3. Budgets beneath a higher-level budget are **sub-allocations**: paced individually for drill-down but never added to totals.
4. Spend with no budget at any level is shown as *unbudgeted spend*, never mixed into pacing.

Spend is stored only at the leaf level (campaign, or account for platforms without campaigns) and always rolled up from there, so it is counted once.

### Daily Action Center

For each budget line the app produces one recommendation, for example:

- *ABC Plumbing — Projected to overspend by $1,249. Reduce average daily spend from ≈$200 to ≈$118 for the remaining 15 days.*
- *Dental Group — Projected to underspend by $2,378. Increase average daily spend from ≈$177 to ≈$340 to reach the monthly budget.*

These are recommendations only. **The app never changes budgets in any ad platform.**

## Architecture

```
prisma/schema.prisma        Database schema (agencies, users, clients, accounts, campaigns,
                            OAuth credentials, budgets + revisions, daily performance,
                            conversions, exchange rates, sync runs, alerts, reports, schedules)
prisma/seed.ts              Demo data
src/lib/pacing/             Pure pacing engine, distributions, roll-ups, thresholds (no I/O)
src/lib/                    Money, metrics, date ranges, recommendations, access policy (pure)
src/server/                 Database access, auth, access control, pacing/reporting services
src/server/integrations/    Platform adapter contract + integration status registry
src/app/                    Next.js App Router pages and server actions
src/components/             UI (shadcn-style primitives, charts, dashboard)
```

- **Multi-tenancy.** Every query is scoped to the user's agency. Account managers see their primary and assigned clients. Client users see only their own client, read-only. A client page outside your scope returns 404 rather than 403, so it doesn't reveal that the client exists. The policy lives in `src/lib/access.ts` (unit-tested) and the matching database filters in `src/server/access.ts`.
- **Auth.** Email and password (bcrypt), with a signed HttpOnly session cookie. The user is re-read from the database on every request, so role changes apply immediately.
- **Secrets.** OAuth tokens are encrypted at rest with AES-256-GCM (`src/server/crypto.ts`) and never sent to the browser.
- **Adding a platform.** Implement `PlatformAdapter` (`src/server/integrations/types.ts`), which covers OAuth, account and campaign discovery, leaf-level daily rows, data-completeness date, restatement window and spend verification, then register it. The pacing engine and reports don't change.
- **Scale.** Pacing for an agency is three indexed queries plus in-memory computation. That is comfortable at hundreds of accounts. Beyond that, the next step is caching per-client results after each sync.

## What's built and what isn't

### Phase 1: core application ✅ (demo data)

- Authentication and three roles with tested data isolation
- Full database schema for all five phases
- Agency dashboard:
  - summary tiles
  - Daily Action Center
  - agency pacing chart
  - a pacing table sortable and filterable by client, platform, manager and status, with every column from the spec
- Client pages:
  - overview metrics with month-over-month or previous-period comparison
  - a budget pacing chart (cumulative actual vs planned vs projected) at client, account and campaign level
  - budget lines
  - platform breakdown
  - daily trend charts
  - campaign table
  - historical budget performance
- Budget entry:
  - client, account or campaign level
  - custom periods, distributions, pauses and forecast model
  - mid-period revisions with audit trail (who, when, note)
  - validation that prevents duplicate or overlapping budgets
- Settings: pacing thresholds and white-label branding (agency name, logo, brand color, report header and footer)
- Integrations page that states plainly that nothing is connected and what each platform requires
- 58 unit tests: ABC Plumbing and Dental Group examples, 28/29/30/31-day months, leap year, timezones, DST, mid-month increases and cuts, zero spend, zero budget, period not started or ended, every distribution, pauses, both forecast models, threshold boundaries, roll-ups without double counting, permissions, recommendations, budget validation, money parsing
- End-to-end browser checks (run manually during development; not yet committed as an automated suite): login, client isolation, manager scoping, budget create, duplicate rejection, mid-month revision, threshold validation, mobile layout

### Not built yet

| Phase | Item | Notes |
|---|---|---|
| 2 | Google Ads live integration | Needs a Google Cloud OAuth client and an approved Google Ads **developer token** from your MCC (Basic access or higher). Adapter contract is in place. |
| 2 | Background sync runner | Scheduled and manual refresh, retries with backoff, rate-limit handling, re-syncing recent days to pick up restated conversions, and `SyncRun` logging. Schema exists; the runner does not. |
| 3 | Meta Ads | Needs a Meta app with Marketing API access, App Review for `ads_read`, and business verification. |
| 3 | Microsoft Advertising | Needs a developer token and an Azure app registration. |
| 3 | Google Local Services Ads | **Not verified yet.** Before building, confirm from current Google documentation which official API exposes LSA leads and charges, and whether it reports verified daily cost. Until then, LSA spend is labelled *estimated* everywhere. |
| 4 | Alerts and notifications | Schema (`Alert`, with a dedupe key, and `Notification`) is ready. The evaluator, email delivery and daily summary are not built. |
| 4 | PDF and CSV export, scheduled email reports, custom report builder | Schema (`Report`, `ReportSchedule`) is ready. |
| 4 | Branded client portal | Client users already get a read-only view of their own client; a custom domain and branded login are not built. |
| 5 | More forecast models, seasonality learned from history, custom weekday and daily weights in the UI | The engine already supports custom weights; the budget form exposes only even, business-days and weekend-weighted. |
| — | Currency conversion | Original currency is stored per account and an `ExchangeRate` table exists. If an account's currency differs from its budget's, the row shows a warning; conversion is not applied. Agency totals assume one currency. |
| — | User management UI, password reset, SSO | Users are created by the seed or directly in the database for now. |
| — | Multiple agencies | Data model and access checks are agency-scoped; agency sign-up and onboarding are not built. |
