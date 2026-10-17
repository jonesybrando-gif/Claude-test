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
- **Secrets go only into Railway's Variables settings**, never into chat, the repository or a document. Claude copies a value from one console straight into the other field.
- **Ad accounts are read-only.** Never change campaigns, budgets or billing in Google Ads, Meta or Microsoft Advertising.
- **Before any click that can't be undone, Claude asks first.** That includes deleting something, merging, publishing, or submitting a review.

## 1. Merge the pull requests

- [ ] On GitHub (jonesybrando-gif/Claude-test), merge PRs #1 → #8 in order. Each is based on the previous one. After merging one, check the next PR's base updated to `main`; if not, edit its base to `main`.
- [ ] Confirm `main` contains `railway.json` and `docs/launch-checklist.md`.

## 2. Database (Neon, free plan)

- [ ] Create a free Neon account and a project, for example "pacing-monitor", in the US East region (close to Railway's default).
- [ ] Copy the connection string (Dashboard → Connect). It becomes `DATABASE_URL` in step 3. Don't paste it anywhere else.

## 3. Hosting (Railway, Hobby plan, about $5/month)

- [ ] Sign up at railway.com with GitHub and choose the Hobby plan (you add the payment card).
- [ ] New Project → Deploy from GitHub repo → `jonesybrando-gif/Claude-test`, branch `main`. `railway.json` in the repo sets the build, runs database migrations on every start, and runs one instance.
- [ ] In the service's **Variables**, add:
  | Name | Value |
  |---|---|
  | `DATABASE_URL` | from step 2 |
  | `AUTH_SECRET` | a random secret (see below) |
  | `TOKEN_ENCRYPTION_KEY` | a different random secret (keep a private backup: losing it means reconnecting ad accounts) |
  | `CRON_SECRET` | a different random secret |
  | `INTERNAL_SCHEDULER` | `1` (turns on the built-in hourly sync; no external scheduler needed) |
  | `APP_URL` | `https://app.<yourdomain>` (see the Domain step below) |

  For each random secret, generate it in the browser's developer console with
  `btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))`
  and paste the result straight into the Railway variable field.
- [ ] **Domain.** The app gets its own domain, separate from any client's website.
  - Buy it before step 4: Google, Meta and Microsoft all register redirect addresses on it, so changing it later means redoing those.
  - Use the address `app.<yourdomain>` (for example `app.adreportshq.com`).
  - In Railway: **Settings → Networking → Custom Domain**, enter `app.<yourdomain>`, then add the CNAME record Railway shows at the domain's registrar or DNS host. Railway issues the HTTPS certificate automatically.
  - Set `APP_URL` to `https://app.<yourdomain>` and redeploy.
- [ ] Open the site; the sign-in page should load.
- [ ] Create your login. On your computer, in a terminal in the repo, with `DATABASE_URL` set to the Neon value, run:
  `APP_URL=<your app address> npm run setup:owner -- --email you@youragency.com --name "Your Name" --agency "Your Agency" --timezone America/New_York`
  It prints a one-time link: open it to set your password.
- [ ] Optional: `ANTHROPIC_API_KEY` (console.anthropic.com → API keys) for the AI features, and `SMTP_URL` + `EMAIL_FROM` for email.
- [ ] Usage: Railway → Usage should stay near the $5 included each month. Set a usage limit (Workspace → Usage → limits) so it can never surprise you.

## 4. Google Ads and Local Services Ads

Follow [google-ads-setup.md](google-ads-setup.md). In short:
- [ ] Google Cloud Console: create a project, enable the Google Ads API, configure the OAuth consent screen, and create an OAuth client (Web). The redirect URI is `<APP_URL>/api/integrations/google-ads/callback` (check the exact path in the setup guide).
- [ ] Google Ads MCC → API Center: get the developer token and **apply for Basic access** (you submit). Until it's approved, the token only works with test accounts.
- [ ] Add `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET` and `GOOGLE_ADS_DEVELOPER_TOKEN` in Railway Variables (Railway redeploys automatically).

## 5. Meta Ads

Follow [meta-ads-setup.md](meta-ads-setup.md):
- [ ] Create a Business app in Meta for Developers, add Marketing API and Facebook Login, and set the redirect URI.
- [ ] Add `META_APP_ID` and `META_APP_SECRET` in Railway Variables.
- [ ] To read ad accounts your clients own, request Advanced Access through App Review (you submit).

## 6. Microsoft Advertising

Follow [microsoft-ads-setup.md](microsoft-ads-setup.md):
- [ ] Register an app in Microsoft Entra (Azure), add the redirect URI, and create a client secret.
- [ ] Get a developer token from the Microsoft Advertising Developer Portal.
- [ ] Add `MICROSOFT_ADS_CLIENT_ID`, `MICROSOFT_ADS_CLIENT_SECRET` and `MICROSOFT_ADS_DEVELOPER_TOKEN` in Railway Variables.

## 7. First live check

- [ ] In the app: Integrations → connect one platform, link one ad account to a client, and run a sync.
- [ ] Compare last month's spend, clicks and conversions in the app against the platform's own interface for the same dates and time zone. Note any differences and bring them back to a coding session to fix.
