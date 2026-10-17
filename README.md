# Budget Pacing Monitor

A multi-tenant advertising reporting and **budget pacing** app for agencies.

- **Reporting:** KPI dashboards (spend, impressions, clicks, CTR, CPC, conversions, CPA, leads, ROAS and more) across Google Ads, Meta, Microsoft Advertising and Local Services Ads, with branded client reports you can customize per client.
- **Budget pacing:** enter each client's monthly budget. The app works out whether campaigns are spending too fast, too slow or on target, forecasts month-end spend, and tells account managers exactly what daily spend to aim for.
- **AI assistant:** proactive suggestions, report summaries and client email drafts, written only from the app's own data and always reviewed by a person before anything goes out.

> **Status:** Phase 1 (core application) is built and tested with demo data. Phases 2–3 (Google Ads, Meta Ads, Microsoft Advertising and Google Local Services Ads integrations, plus background sync) are built and tested against each platform's documented API, but **none has yet been run against a real ad account**. Setup guides: [Google Ads + LSA](docs/google-ads-setup.md), [Meta Ads](docs/meta-ads-setup.md), [Microsoft Advertising](docs/microsoft-ads-setup.md). All sample data is flagged `isDemo` and labelled "Demo data" in the UI. See [What's built and what isn't](#whats-built-and-what-isnt).

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
| `APP_URL` | Public base URL; must match the OAuth redirect URI registered with Google |
| `CRON_SECRET` | Bearer secret for `/api/cron/sync` |
| `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_DEVELOPER_TOKEN` | Google Ads API credentials (also used for Local Services Ads); see [docs/google-ads-setup.md](docs/google-ads-setup.md) |
| `SMTP_URL`, `EMAIL_FROM` | Outgoing email for invitations, password resets, alerts and daily summaries. Without them, emails are recorded in **Settings → Email log** but not delivered, and invite/reset links are shown to the admin to share. |
| `ANTHROPIC_API_KEY` | Optional. Turns on the AI assistant (Claude API). Usage is billed by Anthropic to that key, separately from this app. Without it, the AI buttons explain how to turn it on. |
| `ANTHROPIC_MODEL` | Optional. Defaults to `claude-opus-5-5`. |
| `META_APP_ID`, `META_APP_SECRET` | Meta app credentials; see [docs/meta-ads-setup.md](docs/meta-ads-setup.md) |
| `MICROSOFT_ADS_CLIENT_ID`, `MICROSOFT_ADS_CLIENT_SECRET`, `MICROSOFT_ADS_DEVELOPER_TOKEN` | Microsoft Advertising credentials; see [docs/microsoft-ads-setup.md](docs/microsoft-ads-setup.md) |

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
| `npm run db:seed` | Reset and reload the demo agency (development only; it creates logins with a known password) |
| `npm run setup:owner -- --email you@agency.com --name "Your Name" --agency "Your Agency" [--remove-demo]` | Create your own agency and admin login and print a one-time link to set your password. Use this instead of the demo data for real use. |
| `npm run sync` | Sync all live accounts that are due (`-- --account <id> [--backfill]` for one account) |
| `npm run alerts` | Evaluate alerts and send any due daily summaries (also runs after every `/api/cron/sync`) |

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
src/server/integrations/    Platform adapter contract, registry, OAuth token storage, Google Ads adapter
src/server/sync/            Sync runner (windowed re-import, retries, failure handling, run log)
src/server/ai/              AI assistant: grounding context, Claude API calls, server actions
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

### Phase 2: Google Ads ✅ built · ⏳ awaiting a live account to verify

- OAuth 2.0 connection flow (admin only). The `state` parameter is signed and bound to the user and a nonce cookie, refresh tokens are encrypted at rest, and disconnecting revokes the grant at Google.
- MCC support: lists every account in the manager hierarchy, and the admin assigns each account to a client. `login-customer-id` is set automatically for accounts reached through a manager.
- Sync runner:
  - imports about 13 months of history on first link, in 92-day chunks
  - hourly incremental syncs that re-fetch a 14-day restatement window, replaced atomically
  - retries with backoff on rate limits and temporary errors
  - a per-account lock so two syncs never overlap
  - every run logged with range, row count and error
- Failure handling: revoked tokens, unapproved developer tokens and lost account access each surface as a distinct status in the UI.
- Entry points: `/api/cron/sync` (Bearer `CRON_SECRET`), `npm run sync`, and a **Refresh now** button on client pages.
- Data-completeness rule (yesterday counts after 3am account time). Pacing never uses today's partial data.
- Tests: 28 Google Ads and sync tests, covering GAQL building and injection safety, micros-to-cents conversion, response parsing, error classification, retry behavior, the hierarchy listing, and database-backed sync scenarios.
- Checked against Google's real OAuth and Ads endpoints using deliberately invalid credentials, to confirm the request format and error handling.

### Phase 3: Meta Ads, Microsoft Advertising, Local Services Ads ✅ built · ⏳ awaiting live accounts to verify

- **Meta Ads** (Graph / Marketing API v26.0):
  - Facebook Login with a long-lived token (expiry is shown, and the app asks for reconnection in the final week), or a pasted Business Manager system-user token. The pasted token is validated with Meta's `debug_token` before it is stored.
  - Ad account discovery (direct, plus business-owned and client accounts).
  - Daily campaign insights. Leads and purchases are counted from one preferred action type each, so overlapping types are never double-counted.
  - Signed calls (`appsecret_proof`); retry waits come from Meta's rate-limit headers.
- **Microsoft Advertising** (v13 JSON REST, since SOAP is retired on 2027-01-31):
  - Microsoft identity sign-in with rotating refresh tokens.
  - Account discovery (`User/Query` → `Accounts/Search`).
  - Asynchronous daily campaign reports: submit, poll, then download the ZIP/CSV, with a built-in unzip and CSV parser.
  - Time zone mapping; errors are recognized even when returned inside an HTTP 200 response.
- **Google Local Services Ads** (through the Google Ads API and connection):
  - `LOCAL_SERVICES` campaigns are split out of Google Ads, so their cost is never counted twice.
  - Daily leads and charged leads come from `local_services_lead`.
  - When charged leads arrive with no cost, spend is flagged "not reported" rather than estimated.
- **Shared framework:** one OAuth route for every platform (`/api/integrations/<platform>/connect`), an account picker with one column per platform (Google offers Google Ads and Local Services), and "Don't monitor" to stop syncing an account while keeping its history.
- **Tests:** 34 new, covering parsing, money conversion, error classification, OAuth and token behavior, paging and host safety, report polling, ZIP/CSV handling, and LSA lead attribution and spend verification.

### Phase 4a: Team management and alerts ✅

- **Team (Settings → Team):**
  - invite administrators, account managers (with their assigned clients) and read-only client users
  - change roles and access, and deactivate users, which signs them out immediately
  - resend invitations or send a password reset
  - the agency always keeps at least one active administrator, and admins can't lock themselves out
- **Invitations and password resets:**
  - single-use links (72 hours for invitations, 60 minutes for resets); only a hash of each token is stored
  - "Forgot password" never reveals whether an email has an account
  - changing or resetting a password signs out every other session
- **Your account:** change name and password, and opt in or out of alert emails and the daily summary.
- **Alerts (Alerts page, with an unread count in the navigation):**
  - overspending and underspending, including a forecast that will miss a mid-month budget increase
  - projected overrun beyond a set %
  - spend spike, spend stopped, enabled campaign not spending
  - failed or stale sync, disconnected account
  
  Every rule has adjustable thresholds (**Settings → Alerts**). Each issue alerts once (deduplicated by a stable key), stays open while true, can be acknowledged, and resolves itself when it clears. Alerts go to admins and to the managers assigned to the client: in the app, plus one email per person per run.
- **Daily summary email:** weekday mornings from 7:00 in the agency's time zone, once per person per day, covering only that person's clients.
- **Email:** sent over SMTP with white-labelled templates. Every message is recorded in **Settings → Email log**, with one-time links removed from the stored copy.
- **Tests:** 25 new, including database-backed tests of recipients, deduplication, resolution, acknowledgement and summary timing, plus 28 browser checks.

### Phase 4b: Reports and sign-in protection ✅

- **PDF reports:** branded with agency name, color, logo, header and footer text, plus page numbers.
  - **Client report:** KPI tiles with change vs. the comparison period, a cumulative pacing chart, pacing figures, budget lines, a platform breakdown (impressions, clicks, CTR, CPC, conversions, cost per conversion, leads, ROAS), campaigns, budget history and data notes. It follows the date range selected on the client page.
  - **Internal variant:** "PDF + notes" adds the internal recommendations. Client users always get the client-facing version.
  - **Agency report:** summary, agency pacing chart, and every budget line sorted by urgency, with recommendations.
- **CSV exports:**
  - **Client:** daily rows per account and campaign, with every metric.
  - **Agency:** every budget line with its pacing figures.
  - Money is exact to the cent, and Excel-friendly (UTF-8 BOM).
  - Text from ad platforms is neutralised so it can never run as a spreadsheet formula.
- **Permissions:** downloads follow the same rules as the pages. Client users can only download their own client.
- **Sign-in protection:**
  - 5 failed attempts for an email from one address locks that combination for 15 minutes.
  - 30 failures from one address lock that address for 30 minutes.
  - 50 failures for one email across all addresses within an hour lock it for 15 minutes.
  - Attempts from elsewhere therefore can't lock you out from your own connection.
  - Unknown emails take the same time to check as real ones.
- **Owner setup:** `npm run setup:owner` creates your agency and admin login. A brand-new agency sees a getting-started screen.
- ROAS shows "—" when a platform reports no conversion value (lead generation, LSA) instead of a misleading 0.00x.

### Phase 5a: KPI dashboards and report builder ✅

- **Performance page:** 12 KPI scorecards for all clients with sparklines and change vs. the comparison period, daily trend charts, and sortable tables by platform and by client.
  - Blended KPIs are true ratios (total spend ÷ total clicks), never averages of per-platform averages.
  - Metrics no platform reported (for example leads on Google Ads) show "—" and "not reported" rather than 0.
- **Report builder:** **Settings → Reports** sets the agency's default report, and **Customize report** on a client page gives that client its own. Each layout chooses:
  - the KPI scorecards (up to 12)
  - up to 3 trend charts
  - which sections appear (summary, KPIs, trends, pacing, platforms, campaigns, budget history, notes)
  - the title and a written summary
  - the default date range and comparison
- **Template-driven reports:** the client page and the PDF follow the layout.
  - Client logins don't see sections a layout turns off. Your team still sees them, marked "Hidden from client report".
  - The PDF adds a daily chart for each trend KPI, with the comparison period dashed, and defines each KPI in its notes.

### Phase 5b: AI assistant ✅ (tested against a mock API · ⏳ needs your `ANTHROPIC_API_KEY` for live use)

- **Suggestions:** on each client page (staff only), "Generate suggestions" gives up to 6 prioritised recommendations, each citing the figures it rests on. They are saved, so viewing the page doesn't cost anything.
- **Report summary:** "Draft with AI" in Customize report writes the client-facing summary into the form. Nothing is saved until you press Save.
- **Client emails:** "Email client" drafts a monthly update, pacing update or results highlight, following your notes. You edit the draft and press Send. Replies go to you, and every send is recorded in the Email log.
- **Grounding:** the model gets only that client's report data, with every number pre-formatted.
  - Its instructions forbid inventing figures, benchmarks or causes.
  - It is told that conversions are platform-reported.
  - It must flag demo data.
  - It must never claim it changed anything in an ad platform.
- **Data sent to Anthropic:** the client's name, account and campaign names, and their metrics. No logins or tokens are sent.
- **Model:** `claude-opus-5-5` with structured output. Server-side fallback (`fallbacks: "default"`) is on, so if the model declines a request, Anthropic retries it on its recommended fallback model.

### Not built yet

| Phase | Item | Notes |
|---|---|---|
| 2 | First live Google Ads connection | Needs the Cloud Console and MCC setup in [docs/google-ads-setup.md](docs/google-ads-setup.md). This is the step that moves Google Ads from "built" to "verified". |
| 3 | First live Meta, Microsoft and LSA connections | Needs the setup in the guides above. Meta also needs App Review and Advanced Access for client-owned ad accounts. |
| 4 | Scheduled email reports | PDF/CSV export and the report builder are done; the `ReportSchedule` table is ready for scheduled sending. |
| 4 | Branded client portal | Client users already get a read-only view of their own client; a custom domain and branded login are not built. |
| 5 | More forecast models, seasonality learned from history, custom weekday and daily weights in the UI | The engine already supports custom weights; the budget form exposes only even, business-days and weekend-weighted. |
| — | Currency conversion | Original currency is stored per account and an `ExchangeRate` table exists. If an account's currency differs from its budget's, the row shows a warning; conversion is not applied. Agency totals assume one currency. |
| — | Single sign-on (Google / Microsoft) and two-factor authentication | Email and password only for now, with sign-in attempt limits (Phase 4b). |
| — | Multiple agencies | Data model and access checks are agency-scoped; agency sign-up and onboarding are not built. |
