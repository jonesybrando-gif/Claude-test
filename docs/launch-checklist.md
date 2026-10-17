# Launch checklist (for a Claude session working in your Chrome)

This is the work left to take the app from demo to live. Most of it happens
in web consoles, so it's written for a Claude session that can use your
Chrome browser (Claude in Chrome) together with this repository checked out
on your computer. Work top to bottom; tick items off as you go.

## Ground rules for Claude

- **You stay in charge of these** (Claude stops and asks you):
  - signing in, two-factor prompts and CAPTCHAs
  - accepting terms of service or developer agreements
  - entering payment details or choosing a paid plan
  - submitting applications that go out under your name (developer tokens, Meta App Review)
- **Secrets go only into the hosting provider's environment-variable settings**, never into chat, the repository or a document. Claude copies a value from one console straight into the other field.
- **Ad accounts are read-only.** Never change campaigns, budgets or billing in Google Ads, Meta or Microsoft Advertising.
- **Before any click that can't be undone, Claude asks first.** That includes deleting something, merging, publishing, or submitting a review.

## 1. Merge the pull requests

- [ ] On GitHub (jonesybrando-gif/Claude-test), merge PRs #1 → #8 in order. Each is based on the previous one. After merging one, check the next PR's base updated to `main`; if not, edit its base to `main`.
- [ ] Confirm `main` contains `vercel.json` and `docs/launch-checklist.md`.

## 2. Database (Neon, or any hosted Postgres 15+)

- [ ] Create a project, for example "pacing-monitor", in the region nearest you.
- [ ] Copy the **pooled** connection string. It becomes `DATABASE_URL` in step 3. Don't paste it anywhere else.

## 3. Hosting (Vercel)

- [ ] Import the GitHub repo as a new project. The framework is detected as Next.js; `vercel.json` sets the build to run database migrations first.
- [ ] Add environment variables (Production):
  | Name | Value |
  |---|---|
  | `DATABASE_URL` | from step 2 |
  | `AUTH_SECRET` | run `openssl rand -base64 32` in a terminal on your computer |
  | `TOKEN_ENCRYPTION_KEY` | another `openssl rand -base64 32` (keep a private backup: losing it means reconnecting ad accounts) |
  | `CRON_SECRET` | another `openssl rand -base64 32` |
  | `APP_URL` | the production URL, for example `https://your-project.vercel.app` (update it if you add a custom domain) |
- [ ] Deploy and open the site. The sign-in page should load.
- [ ] Create your login: in a terminal in the repo, with `DATABASE_URL` set to the production value, run `npm run setup:owner` and follow the prompts.
- [ ] Sync schedule: `vercel.json` asks for hourly syncs. Vercel's free plan only allows a daily cron. Either:
  - upgrade the project, or
  - change the schedule to daily, or
  - use a free external scheduler (for example cron-job.org) to call `GET <APP_URL>/api/cron/sync` hourly with the header `Authorization: Bearer <CRON_SECRET>`.
- [ ] Optional: a custom domain such as `reports.youragency.com`, for branded share links. Then update `APP_URL` and redeploy.
- [ ] Optional: `ANTHROPIC_API_KEY` (console.anthropic.com → API keys) for the AI features, and `SMTP_URL` + `EMAIL_FROM` for email.

## 4. Google Ads and Local Services Ads

Follow [google-ads-setup.md](google-ads-setup.md). In short:
- [ ] Google Cloud Console: create a project, enable the Google Ads API, configure the OAuth consent screen, and create an OAuth client (Web). The redirect URI is `<APP_URL>/api/integrations/google-ads/callback` (check the exact path in the setup guide).
- [ ] Google Ads MCC → API Center: get the developer token and **apply for Basic access** (you submit). Until it's approved, the token only works with test accounts.
- [ ] Add `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET` and `GOOGLE_ADS_DEVELOPER_TOKEN` in Vercel, then redeploy.

## 5. Meta Ads

Follow [meta-ads-setup.md](meta-ads-setup.md):
- [ ] Create a Business app in Meta for Developers, add Marketing API and Facebook Login, and set the redirect URI.
- [ ] Add `META_APP_ID` and `META_APP_SECRET` in Vercel.
- [ ] To read ad accounts your clients own, request Advanced Access through App Review (you submit).

## 6. Microsoft Advertising

Follow [microsoft-ads-setup.md](microsoft-ads-setup.md):
- [ ] Register an app in Microsoft Entra (Azure), add the redirect URI, and create a client secret.
- [ ] Get a developer token from the Microsoft Advertising Developer Portal.
- [ ] Add `MICROSOFT_ADS_CLIENT_ID`, `MICROSOFT_ADS_CLIENT_SECRET` and `MICROSOFT_ADS_DEVELOPER_TOKEN` in Vercel.

## 7. First live check

- [ ] In the app: Integrations → connect one platform, link one ad account to a client, and run a sync.
- [ ] Compare last month's spend, clicks and conversions in the app against the platform's own interface for the same dates and time zone. Note any differences and bring them back to a coding session to fix.
