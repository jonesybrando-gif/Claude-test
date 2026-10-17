# Connecting Google Ads

This guide covers the one-time setup an agency administrator does in Google Cloud Console and the Google Ads manager (MCC) account, then the steps inside the app.

The integration uses only the official Google Ads API (REST, API version `v26` by default) with OAuth 2.0. It reads data and never changes anything in Google Ads.

## What you need

| Item | Where it comes from |
|---|---|
| OAuth client ID and client secret | Google Cloud Console |
| Developer token | Google Ads manager (MCC) account → API Center |
| A Google user with access to the MCC | Used once to authorize the connection |
| The app running at a stable URL | Production domain, or `http://localhost:3000` for local testing |

## 1. Google Cloud Console

1. Create a project or pick an existing one.
2. **APIs & Services → Library**: enable the **Google Ads API**.
3. **APIs & Services → OAuth consent screen**:
   - **User type:** if your agency uses Google Workspace and everyone who will connect accounts is in that Workspace, choose **Internal**. Otherwise choose **External**.
   - **Scope:** add `https://www.googleapis.com/auth/adwords`.
   - **Publishing status:** while an External app is in **Testing**, only listed test users can authorize it, and Google expires refresh tokens after 7 days, so syncing would stop weekly. For ongoing use, set the app to **In production**. Google may then ask you to complete app verification for this scope. Follow the prompts in the console.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - **Application type:** Web application.
   - **Authorized redirect URIs:** add one entry per place the app runs:
     - `https://YOUR-DOMAIN/api/integrations/google-ads/callback`
     - `http://localhost:3000/api/integrations/google-ads/callback` (local testing only)
5. Copy the **client ID** and **client secret**.

## 2. Google Ads manager account (MCC)

1. Sign in to the manager account that contains your clients' accounts.
2. Open **Admin → API Center**. If you can't find it, search for "API Center" in Google Ads.
3. Apply for a **developer token** and copy it.
4. Check its **access level**:
   - **Test access** only works with Google Ads *test* accounts. Calls to real accounts fail, and the app shows "Waiting on platform approval".
   - Real client accounts need a higher level, such as **Basic access**, which requires an application that Google reviews. Apply in the API Center, and describe the use as read-only reporting and budget pacing for your agency's clients.

## 3. Configure the app

Set these environment variables on the server, then restart it:

```bash
GOOGLE_ADS_CLIENT_ID="…apps.googleusercontent.com"
GOOGLE_ADS_CLIENT_SECRET="…"
GOOGLE_ADS_DEVELOPER_TOKEN="…"
APP_URL="https://YOUR-DOMAIN"      # must match the redirect URI registered above
CRON_SECRET="$(openssl rand -hex 24)"
# GOOGLE_ADS_API_VERSION="v26"     # optional; Google retires old versions on a schedule
```

The **Integrations** page shows which values are still missing.

## 4. Connect and choose accounts

1. Sign in as an **agency administrator** and open **Integrations**.
2. Click **Connect Google Ads**, sign in as a Google user with access to the MCC, and approve.
3. You land on the account list. It contains every account under your manager hierarchy. Pick a client for each account you want to monitor and click **Save account links**.
4. Each linked account imports about **13 months** of daily history in the background, then keeps syncing.

## 5. Keep data fresh

Call the sync endpoint about every hour:

```bash
curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://YOUR-DOMAIN/api/cron/sync
```

- **Vercel:** add a cron job for `/api/cron/sync`. Vercel sends the `Authorization: Bearer $CRON_SECRET` header automatically when `CRON_SECRET` is set.
- **Any server:** a system cron running `npm run sync` from the app directory works too.

Account managers can also click **Refresh now** next to an account on its client page.

## How syncing behaves

- **Each sync** re-fetches from 14 days before the last complete day through today. Google keeps adjusting recent days as late conversions arrive. The window is replaced atomically, so restated numbers overwrite old ones and days that dropped to zero are cleared.
- **Pacing never uses today's partial data.** Yesterday counts as complete after 3:00 in the Google Ads account's time zone. This is a deliberately conservative rule, not a Google guarantee.
- **Dates** follow the Google Ads account's time zone. If that differs from the client's reporting time zone, the client page shows a note.
- **Money:** cost arrives in micros and is converted to whole cents with integer arithmetic.
- **Rate limits and temporary errors** are retried with exponential backoff, honoring any retry delay Google returns.
- **Error states:**

| Problem | What the app does |
|---|---|
| Authorization revoked | Connection shows **Needs reconnecting**; click **Reconnect** |
| Developer token not approved for real accounts | **Waiting on platform approval** |
| The Google user lost access to an account | That account is marked **Disconnected**; its existing data is kept |

- **Every run** is recorded with its date range, row count and any error.

## Verification status

The integration is unit-tested against the documented REST request and response formats. Its requests have also been checked against Google's real endpoints, using deliberately invalid credentials to confirm request format and error handling. **It has not yet been run against a real, authorized Google Ads account.** The first live connection is the remaining step before it can be marked verified.
