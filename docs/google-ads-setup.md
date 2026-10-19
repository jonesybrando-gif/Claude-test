# Connecting Google Ads

This guide covers the one-time setup an agency administrator does in Google Cloud Console and the Google Ads manager (MCC) account, then the steps inside the app.

The integration uses only the official Google Ads API (REST, API version `v26` by default) with OAuth 2.0. It reads data and never changes anything in Google Ads.

## What you need

| Item | Where it comes from |
|---|---|
| OAuth client ID and client secret | Google Cloud Console |
| Google Ads API access for the Cloud project | Google Cloud Console (see section 2). Developer tokens were retired on 9 September 2026 and are no longer needed |
| A Google login per client account | Any login that can see the client's Google Ads account: your MCC login, a login the client added as a user, or the client's own |
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

## 2. Google Ads API access (Google Cloud Console)

Google retired Google Ads API developer tokens on **9 September 2026**. API access now belongs to the **Google Cloud project** behind the OAuth client, and the API Center in Google Ads no longer processes requests.

1. In the Cloud project, open the Google Ads API's access settings and check the **access level**:
   - **Test access** only works with Google Ads *test* accounts. Calls to real accounts fail, and the app shows "Waiting on platform approval".
   - Real client accounts need **Explorer**, **Basic** or **Standard** access. Apply in the Cloud Console and describe the use as read-only reporting and budget pacing for your agency's clients. New Basic and Standard applications need brand verification. The app's homepage, privacy policy and terms (`/`, `/privacy`, `/terms`) support it.
2. An existing developer token still works for now, and the app sends it if `GOOGLE_ADS_DEVELOPER_TOKEN` is set. Google recommends removing it, and a future API version will reject it.

## 3. Configure the app

Set these environment variables on the server, then restart it:

```bash
GOOGLE_ADS_CLIENT_ID="…apps.googleusercontent.com"
GOOGLE_ADS_CLIENT_SECRET="…"
# GOOGLE_ADS_DEVELOPER_TOKEN="…"   # optional, legacy; Google retired developer tokens
APP_URL="https://YOUR-DOMAIN"      # must match the redirect URI registered above
CRON_SECRET="$(openssl rand -hex 24)"
# GOOGLE_ADS_API_VERSION="v26"     # optional; Google retires old versions on a schedule
```

The **Integrations** page shows which values are still missing.

## 4. Connect each client's account

**From the client (one account per client):**
1. As an **agency administrator**, open the client and choose **Ad accounts**.
2. Under Google Ads, click **Connect Google Ads**. Google asks which login to use: pick one that can see this client's account.
3. Choose the client's account. Tick **Local Services Ads** too if the client runs them, then click **Link to this client**.
4. A login you've already connected can be reused for another client with **Use this login**, with no new sign-in.

Each client has one account per platform. Linking a different one replaces it; the old one stops syncing and keeps its history. An account can't be live under two clients at once.

**In bulk, from one MCC login:** **Integrations → Connect Google Ads** lists every account under the manager hierarchy and lets you assign several at once.

Each linked account imports about **13 months** of daily history in the background, then keeps syncing.

## 5. Keep data fresh

With `INTERNAL_SCHEDULER=1` (the Railway setup), the app syncs every hour by itself. Otherwise, call the sync endpoint about every hour:

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

## Google Local Services Ads

Local Services Ads come through the **same Google Ads connection**. There's nothing extra to set up in Cloud Console.

- **Linking:** in **Choose accounts** on a Google Ads connection, the **"Local Services Ads → client"** column links an account's Local Services campaigns. You can assign them to the same client as the regular Google Ads campaigns or to a different one.
- **No double counting:** campaigns of type `LOCAL_SERVICES` are always excluded from "Google Ads" and reported only under "Google LSA".
- **Spend:** comes from those campaigns' cost in the Google Ads API.
- **Leads:** come from the `local_services_lead` resource. *Leads* counts every lead created that day; *conversions* counts charged leads, the ones the advertiser pays for.
- **If Google reports no cost:** when Google reports charged leads but no cost for the period, the account is marked **spend not reported** and its pacing line carries a warning. The app does not invent an estimate.
- **Access:** Local Services data is generally only available when the account is reached through a manager (MCC) account.
- **Not imported:** lead details such as phone numbers.
