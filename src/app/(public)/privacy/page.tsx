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
      intro={
        <p>
          {app} is a marketing reporting tool operated by {co} (&quot;we&quot;). Marketing agencies use it to report on their clients&apos; advertising, website traffic, search performance and local business listings. This policy explains what information {app} collects, how it is used, who it is shared with, how long it is kept, and how to have it deleted.
        </p>
      }
    >
      <section className="flex flex-col gap-3">
        <h2>Who uses {app}</h2>
        <p>{app} is used by marketing agencies to report on the marketing they manage for their clients. People who sign in are agency staff and, where invited, staff of those clients. It is not a consumer service and is not directed at children.</p>
      </section>

      <section className="flex flex-col gap-3">
        <h2>Information we collect</h2>
        <ul>
          <li><strong>Account information:</strong> name, email address, role and a securely hashed password for each person who signs in, plus sign-in times and failed sign-in attempts (to protect accounts).</li>
          <li><strong>Advertising data from connected ad accounts:</strong> when an ad account is connected through Google Ads (including Google Local Services Ads), Meta (Facebook and Instagram) Ads or Microsoft Advertising, we read the account&apos;s name, ID, currency and time zone, its campaigns&apos; names and statuses, and daily performance figures (cost, impressions, clicks, conversions, conversion value and leads). Access is read-only.</li>
          <li>
            <strong>Website, search and local listing data from Google:</strong> when an agency administrator connects a Google account under Integrations, we read, with the access that person grants:
            <ul>
              <li><em>Google Analytics 4</em> (read-only): the names and IDs of the Analytics accounts and properties the Google account can see, and, for the properties linked to a client, daily aggregated figures: sessions, users, new users, engaged sessions, engagement time, page views, key events and revenue, broken down by channel, source/medium, landing page and device.</li>
              <li><em>Google Search Console</em> (read-only): the list of verified sites, and, for the sites linked to a client, daily clicks, impressions and average position, broken down by search query, page, country and device.</li>
              <li><em>Google Business Profile</em>, when this connection is offered: the names and cities of the business locations the Google account manages, and, for the locations linked to a client, daily profile views, calls, website clicks, direction requests, messages and bookings, monthly search keywords, and the star rating and date of each review. We keep only review counts and average rating, not review text or reviewer names. Google offers this access only with a permission that also allows changes; {app} never creates, edits or deletes anything in Business Profile.</li>
              <li><em>Your Google account&apos;s email address and ID</em>, to show which Google login a connection uses.</li>
            </ul>
            <p className="mt-2">These are aggregated reports about websites and businesses. We do not receive information that identifies individual website visitors or searchers.</p>
          </li>
          <li><strong>Data from other connected services</strong> an agency chooses to connect, such as call tracking (CallRail) and keyword rank tracking (DataForSEO), used in the same way.</li>
          <li><strong>Access tokens:</strong> the authorization tokens Google, Meta, Microsoft and other connected services issue so we can read that data.</li>
          <li><strong>Information you enter:</strong> client names, budgets, report settings, notes and emails written in the app.</li>
          <li><strong>Usage records:</strong> report-link view counts, the emails the app sends, and standard server logs (such as IP address and time of request) kept by our hosting provider.</li>
        </ul>
        <p>We do not collect information about the people who see or click on ads or visit a website. The connected services provide only aggregated figures.</p>
      </section>

      <section className="flex flex-col gap-3">
        <h2>How we use it</h2>
        <ul>
          <li>To show advertising performance, website traffic, search performance and Business Profile activity, track budgets, and produce dashboards, reports, explanations and alerts for the agency and for the client each account, property, site or location belongs to.</li>
          <li>To operate and secure the service: signing in, preventing abuse and fixing problems.</li>
        </ul>
        <p>We do not sell any information, use it for advertising, build profiles of individuals, or use any connected data for any purpose other than reporting on the client it belongs to.</p>
      </section>

      <section className="flex flex-col gap-3" id="google">
        <h2>Google user data</h2>
        <p>
          {app}&apos;s use and transfer of information received from Google APIs to any other app will adhere to the{" "}
          <a className="underline" href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">Google API Services User Data Policy</a>, including the Limited Use requirements.
        </p>
        <ul>
          <li><strong>What we access:</strong> Google Ads reporting data (read-only), Google Analytics data (read-only), Search Console data (read-only), Google Business Profile account, location and performance data where offered, and your Google account&apos;s email address, as described under &quot;Information we collect&quot;.</li>
          <li><strong>How we use it:</strong> only to provide the reporting features you see in {app}: dashboards, reports, explanations and alerts for the client the data belongs to. We never use it to serve or target advertising, never sell it, and never use it to develop, improve or train generalized artificial intelligence or machine learning models.</li>
          <li><strong>How we store it:</strong> in our database (Neon, United States), with every connection encrypted using HTTPS. Google access and refresh tokens are additionally encrypted with AES-256.</li>
          <li><strong>Who can see it:</strong> signed-in staff of the agency that connected it, and users of the client it is linked to. We transfer it only as described under &quot;Who we share it with&quot;. People do not read it except where you have asked us to, for security, or to comply with the law.</li>
          <li><strong>How long we keep it:</strong> while the Google account stays connected and the client is active. Disconnecting stops all access immediately and revokes {app}&apos;s access at Google; the administrator can delete the imported data at the same time, or ask us to delete it (see below).</li>
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2>Who we share it with</h2>
        <ul>
          <li><strong>The client the data belongs to</strong>, and anyone you send a report or a report link to. Report links can be turned off at any time.</li>
          <li><strong>Service providers that run the app for us</strong>, under their own confidentiality and security terms: our hosting provider (Railway), our database provider (Neon), our email delivery provider when email is enabled, and, only when someone uses the optional AI features, Anthropic, which processes the relevant report figures to write explanations, summaries and emails for that client. Anthropic does not use data sent through its commercial API to train its models.</li>
          <li><strong>When the law requires it</strong>, or to protect the security of the service.</li>
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2>How we protect it</h2>
        <p>All connections use HTTPS. Access tokens for every connected service are encrypted in our database with AES-256. Passwords are stored only as salted hashes. Access within the app is limited by role: client users see only their own reports.</p>
      </section>

      <section className="flex flex-col gap-3">
        <h2>How long we keep it</h2>
        <p>We keep advertising, analytics, search and Business Profile data while the client relationship is active, so reports can compare periods (Google Analytics up to about 13 months of history; Search Console and Business Profile up to about 16 months, as the services allow). When a connection is disconnected, its access tokens are deleted immediately and, for Google, access is revoked at Google; the administrator can also choose to delete the data imported through that connection at that moment. Other data is deleted when the client or user is removed, or within 30 days of a request as described below. Backups held by our database provider expire on its standard schedule.</p>
      </section>

      <section className="flex flex-col gap-3" id="delete">
        <h2>Removing access and deleting your data</h2>
        <ul>
          <li><strong>Disconnect in the app</strong> (Integrations → the connection → Disconnect). This deletes the stored tokens immediately. For the Google Analytics, Search Console and Business Profile connection it also revokes {app}&apos;s access at Google, and you can tick &quot;Also delete imported data&quot; to delete everything imported through that login. For Google Ads it revokes access at Google when it&apos;s the last Google Ads login connected; otherwise remove it at Google yourself as described next.</li>
          <li>
            <strong>Remove the app&apos;s access yourself:</strong>
            {" "}Google at <a className="underline" href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">myaccount.google.com/permissions</a>,
            {" "}Meta at Settings → Business integrations (Facebook) or Business Settings → Integrations (Meta Business Suite),
            {" "}Microsoft at <a className="underline" href="https://account.live.com/consent/Manage" target="_blank" rel="noopener noreferrer">account.live.com/consent/Manage</a> or your organization&apos;s Microsoft Entra settings.
          </li>
          <li><strong>To have your data deleted</strong>, <Contact /> with the subject &quot;Data deletion request&quot; and the email address, account, property or site concerned. We delete the data within 30 days and confirm when it&apos;s done.</li>
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2>Cookies</h2>
        <p>{app} uses one essential cookie to keep you signed in, and short-lived cookies to secure the account connection process. There are no analytics, advertising or tracking cookies.</p>
      </section>

      <section className="flex flex-col gap-3">
        <h2>Changes and contact</h2>
        <p>If this policy changes, we&apos;ll update the date above and, for significant changes, tell signed-in users. For questions or requests about your information, <Contact />. See also our <Link className="underline" href="/terms">terms of service</Link>.</p>
      </section>
    </LegalPage>
  );
}
