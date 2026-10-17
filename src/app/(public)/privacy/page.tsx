import type { Metadata } from "next";
import Link from "next/link";
import { site } from "@/lib/site";
import { Contact, LegalPage } from "../legal";

// Names and contact come from environment variables at request time.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: `Privacy policy · ${site.appName}` };

export default function PrivacyPage() {
  const app = site.appName;
  const co = site.company;
  return (
    <LegalPage
      title="Privacy policy"
      intro={<p>{app} is an advertising reporting tool operated by {co} (&quot;we&quot;). This policy explains what information {app} collects, how it is used, who it is shared with, and how to have it deleted.</p>}
    >
      <section className="flex flex-col gap-3">
        <h2>Who uses {app}</h2>
        <p>{app} is used by {co} to report on the advertising it manages for its clients. People who sign in are {co} staff and, where invited, staff of those clients. It is not a consumer service and is not directed at children.</p>
      </section>

      <section className="flex flex-col gap-3">
        <h2>Information we collect</h2>
        <ul>
          <li><strong>Account information:</strong> name, email address, role and a securely hashed password for each person who signs in, plus sign-in times and failed sign-in attempts (to protect accounts).</li>
          <li><strong>Advertising data from connected ad accounts:</strong> when an ad account is connected through Google Ads (including Google Local Services Ads), Meta (Facebook and Instagram) Ads or Microsoft Advertising, we read the account&apos;s name, ID, currency and time zone, its campaigns&apos; names and statuses, and daily performance figures (cost, impressions, clicks, conversions, conversion value and leads). Access is read-only.</li>
          <li><strong>Access tokens:</strong> the authorization tokens the ad platforms issue so we can read that data.</li>
          <li><strong>Information you enter:</strong> client names, budgets, report settings, notes and emails written in the app.</li>
          <li><strong>Usage records:</strong> report-link view counts, the emails the app sends, and standard server logs (such as IP address and time of request) kept by our hosting provider.</li>
        </ul>
        <p>We do not collect information about the people who see or click on ads. The ad platforms provide only aggregated campaign figures.</p>
      </section>

      <section className="flex flex-col gap-3">
        <h2>How we use it</h2>
        <ul>
          <li>To show advertising performance and budget pacing, produce reports and alerts, and send report emails, for {co} and for the client the ad account belongs to.</li>
          <li>To operate and secure the service: signing in, preventing abuse and fixing problems.</li>
        </ul>
        <p>We do not sell any information, use it for advertising, build profiles of individuals, or use advertising data for any purpose other than reporting on the account it came from.</p>
      </section>

      <section className="flex flex-col gap-3" id="google">
        <h2>Google user data</h2>
        <p>
          {app}&apos;s use and transfer of information received from Google APIs to any other app will adhere to the{" "}
          <a className="underline" href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">Google API Services User Data Policy</a>, including the Limited Use requirements.
          We request read access to Google Ads reporting data only, use it only to provide the reporting features described here, do not transfer it except as described in this policy, do not use it for advertising, and do not allow people to read it except where you have asked us to, for security, or to comply with the law.
          It is never used to develop, improve or train general-purpose artificial intelligence or machine learning models.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2>Who we share it with</h2>
        <ul>
          <li><strong>The client the data belongs to</strong>, and anyone you send a report or a report link to. Report links can be turned off at any time.</li>
          <li><strong>Service providers that run the app for us</strong>, under their own confidentiality and security terms: our hosting provider (Railway), our database provider (Neon), our email delivery provider when email is enabled, and, only when someone uses the optional AI features, Anthropic, which processes the report figures to draft summaries and emails. Anthropic does not use data sent through its commercial API to train its models.</li>
          <li><strong>When the law requires it</strong>, or to protect the security of the service.</li>
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2>How we protect it</h2>
        <p>All connections use HTTPS. Ad-platform access tokens are encrypted in our database with AES-256. Passwords are stored only as salted hashes. Access within the app is limited by role: client users see only their own reports.</p>
      </section>

      <section className="flex flex-col gap-3">
        <h2>How long we keep it</h2>
        <p>We keep advertising data while the client relationship is active, so reports can compare periods. When an ad account is disconnected, its access tokens are deleted immediately. Other data is deleted when the client or user is removed, or on request as described below. Backups held by our database provider expire on its standard schedule.</p>
      </section>

      <section className="flex flex-col gap-3" id="delete">
        <h2>Removing access and deleting your data</h2>
        <ul>
          <li><strong>Disconnect an ad account in the app</strong> (Integrations → Disconnect). This deletes the stored tokens and, for Google, revokes the access at Google.</li>
          <li>
            <strong>Remove the app&apos;s access from the ad platform yourself:</strong>
            {" "}Google at <a className="underline" href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">myaccount.google.com/permissions</a>,
            {" "}Meta at Settings → Business integrations (Facebook) or Business Settings → Integrations (Meta Business Suite),
            {" "}Microsoft at <a className="underline" href="https://account.live.com/consent/Manage" target="_blank" rel="noopener noreferrer">account.live.com/consent/Manage</a> or your organization&apos;s Microsoft Entra settings.
          </li>
          <li><strong>To have your data deleted</strong>, <Contact /> with the subject &quot;Data deletion request&quot; and the email address or ad account concerned. We delete the data within 30 days and confirm when it&apos;s done.</li>
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2>Cookies</h2>
        <p>{app} uses one essential cookie to keep you signed in, and short-lived cookies to secure the ad-account connection process. There are no analytics, advertising or tracking cookies.</p>
      </section>

      <section className="flex flex-col gap-3">
        <h2>Changes and contact</h2>
        <p>If this policy changes, we&apos;ll update the date above and, for significant changes, tell signed-in users. For questions or requests about your information, <Contact />. See also our <Link className="underline" href="/terms">terms of service</Link>.</p>
      </section>
    </LegalPage>
  );
}
