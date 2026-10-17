# Connecting Microsoft Advertising

The app uses the official Microsoft Advertising API v13 through its **JSON REST** interface. Microsoft is retiring the SOAP interface on January 31, 2027. Sign-in uses the Microsoft identity platform (OAuth 2.0). The app never changes anything in Microsoft Advertising.

## 1. Developer token

Sign in to the **Microsoft Advertising Developer Portal** as a Super Admin of your agency's Microsoft Advertising manager account. Request a **developer token** and copy it.

## 2. App registration

1. In the **Microsoft Entra admin center** (formerly Azure AD), open **App registrations → New registration**.
   - **Supported account types:** accounts in any organizational directory *and* personal Microsoft accounts (matches the default `common` tenant).
   - **Redirect URI (Web):** `https://YOUR-DOMAIN/api/integrations/microsoft-ads/callback`. Add `http://localhost:3000/api/integrations/microsoft-ads/callback` for local testing.
2. Under **Certificates & secrets**, create a **client secret** and copy its value.
3. Copy the **Application (client) ID**.

## 3. Configure the app

```bash
MICROSOFT_ADS_CLIENT_ID="…"
MICROSOFT_ADS_CLIENT_SECRET="…"
MICROSOFT_ADS_DEVELOPER_TOKEN="…"
# MICROSOFT_ADS_TENANT="common"   # or your tenant id to restrict sign-in to your organization
```

## 4. Connect

1. On **Integrations**, click **Connect Microsoft Ads** and sign in as a user with access to the client accounts.
2. Click **Choose accounts** and assign each account to a client.

Microsoft rotates refresh tokens, and the app always stores the newest one.

## What gets imported

- **Report:** a daily **campaign performance report** per account. The app submits the report, polls until it's ready, then downloads a ZIP containing a CSV. These syncs take longer than other platforms.
- **Spend:** converted to cents exactly. **Conversions** and **revenue** are as reported by Microsoft Advertising.
- **Time zones:** dates follow the account's time zone. Microsoft names time zones its own way (for example `EasternTimeUSCanada`), so the app maps them to standard ones. An unmapped zone is flagged in the account picker, and the client's time zone is used instead.
- **Restatement:** the last **14 days** are re-fetched on every sync. Yesterday counts as complete after 6:00 account time, which is a conservative rule.

## Verification status

The adapter is unit-tested against the documented REST operations: `User/Query`, `Accounts/Search`, and `GenerateReport/Submit` and `/Poll`. The OAuth sign-in has been exercised against Microsoft's real identity platform. The Microsoft Advertising API hosts were not reachable from the environment where this was built, so the API calls **have not yet been run against a real account**.
