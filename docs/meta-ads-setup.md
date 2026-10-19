# Connecting Meta Ads

The app reads data through the official Meta Graph / Marketing API, version `v26.0` by default. It never changes anything in Meta. An agency administrator does this setup once.

## 1. Create the Meta app

1. Go to [developers.facebook.com](https://developers.facebook.com) and create an app of type **Business**, connected to your agency's Business Manager.
2. Add these products:
   - **Marketing API**
   - **Facebook Login for Business**
3. In **Facebook Login → Settings**, add each valid OAuth redirect URI:
   - `https://YOUR-DOMAIN/api/integrations/meta-ads/callback`
   - `http://localhost:3000/api/integrations/meta-ads/callback` (local testing; Meta may only allow `localhost` while the app is in development mode)
4. In **Facebook Login for Business → Configurations**, create a configuration:
   - **Login variation:** General.
   - **Access token type:** User access token.
   - **Assets:** Ad accounts.
   - **Permissions:** `ads_read` and `business_management`.

   Copy its **Configuration ID**. Business-type apps sign people in with this configuration instead of a permission list.
5. Request the **`ads_read`** and **`business_management`** permissions. To read ad accounts your agency doesn't own (client accounts shared with your Business Manager), Meta requires **Advanced Access**, which needs **App Review** and **business verification**. Describe the use as read-only reporting and budget pacing.
6. Copy the **App ID** and **App Secret**.

## 2. Configure the app

```bash
META_APP_ID="…"
META_APP_SECRET="…"
META_LOGIN_CONFIG_ID="…"           # Facebook Login for Business configuration ID
# META_GRAPH_API_VERSION="v26.0"   # optional
```

## 3. Connect: two options

**Option A: Facebook Login.** On **Integrations**, click **Connect Meta Ads** and sign in as a user with access to the ad accounts.
- Meta issues a long-lived token that lasts about **60 days** and **cannot be refreshed**.
- The Integrations page shows the expiry date and asks you to reconnect in the final week.

**Option B: System-user token (recommended for agencies).**
1. In **Business Settings → Users → System users**, create a system user.
2. Assign it the ad accounts to monitor, with view (analyze) access.
3. Generate a token for your app with `ads_read` and `business_management`.
4. On **Integrations**, open **"Use a Business Manager system-user token instead"** and paste it.

The app checks the token with Meta, confirms it belongs to your app and includes `ads_read`, then stores it encrypted. System-user tokens don't expire unless you revoke them.

After either option, assign accounts: per client from **client → Ad accounts** (one Meta ad account per client), or several at once from **Integrations → Choose accounts**.

## What gets imported

- **Level:** daily insights per campaign (`level=campaign`, `time_increment=1`).
- **Spend:** converted to cents exactly.
- **Leads:** Meta's `lead` action. If that is missing, the app uses grouped on-Facebook leads, then pixel leads. Only one type is counted, because these overlap.
- **Purchases:** `omni_purchase`, then `purchase`, then pixel purchase. Again only one is counted.
- **Conversions:** leads plus purchases, as reported by Meta under each ad account's attribution setting. Conversion value is the purchase value.
- **Reach:** stored per day. It is never summed across days, since summed reach would double-count people.
- **Restatement:** Meta's attribution windows restate recent days, so the last **28 days** are re-fetched on every sync.
- **Rate limits:** retried with backoff, using the wait time Meta reports in its usage headers.

## Verification status

The adapter is unit-tested against the documented request and response formats. It **has not yet been run against a real Meta ad account**: Meta's API hosts were not reachable from the environment where this was built.
