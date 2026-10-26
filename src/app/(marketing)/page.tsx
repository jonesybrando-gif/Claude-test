import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth";
import { appLink, site } from "@/lib/site";
import { PacingBoard } from "./pacing-board";
import { EarlyAccessForm } from "./early-access-form";

export const dynamic = "force-dynamic";

const DESCRIPTION =
  "Budget pacing, alerts and client reporting for agencies running Google Ads, Meta, Microsoft Advertising and Local Services Ads. See every client's month-end spend while there's still time to fix it.";

export const metadata: Metadata = {
  title: { absolute: `${site.appName}: ad budget pacing and client reporting for agencies` },
  description: DESCRIPTION,
  alternates: { canonical: "https://marketingnexus.us/" },
  openGraph: {
    title: `${site.appName}: know which clients will overspend before the month ends`,
    description: DESCRIPTION,
    url: "https://marketingnexus.us/",
    siteName: site.appName,
    type: "website",
  },
};

const MONTH = [
  {
    when: "On the 1st",
    title: "Budgets carry over on their own",
    body: "Set a client's monthly budget once and it repeats. Late in the month, one click copies everything into next month, so nobody rebuilds a spreadsheet.",
  },
  {
    when: "Every morning",
    title: "A pacing check before your first call",
    body: "Spend from every platform is pulled overnight. A daily summary by email or Slack lists who's ahead, who's behind and what each account needs per day to land on budget.",
  },
  {
    when: "When something breaks",
    title: "Alerts that catch it in days, not weeks",
    body: "Cost per result spikes, results drop, or conversion tracking goes quiet. You hear about it with the numbers attached, and can mute what doesn't matter for a client.",
  },
  {
    when: "At month end",
    title: "Reports go out without the Friday scramble",
    body: "Each client gets a branded report by private link or PDF, on a schedule you set, with a plain-language summary and what you're doing next.",
  },
];

const SOURCES: { group: string; items: string[] }[] = [
  { group: "Advertising", items: ["Google Ads", "Meta Ads", "Microsoft Advertising", "Google Local Services Ads"] },
  { group: "Website and local", items: ["Google Analytics 4", "Search Console", "Google Business Profile", "CallRail calls", "Keyword rankings"] },
];

export default async function HomePage() {
  const user = await getCurrentUser();
  if (user) redirect(user.role === "CLIENT_USER" && user.clientId ? `/clients/${user.clientId}` : "/dashboard");

  return (
    <>
      <section className="mn-hero mn-wrap">
        <div className="mn-hero-copy">
          <h1>Know which clients will overspend while there&apos;s still time to fix it.</h1>
          <p className="mn-lede">
            {site.appName} puts every client&apos;s Google, Meta, Microsoft and Local Services spend on one board, forecasts where each month will land,
            and turns the numbers into reports clients actually read.
          </p>
          <div className="mn-actions">
            <a href="#request-access" className="mn-btn mn-btn-primary">Request early access</a>
            <a href="#how-it-works" className="mn-btn mn-btn-quiet">See how a month runs</a>
          </div>
          <p className="mn-hero-note">Read-only access to your ad accounts. Nothing in your campaigns is ever changed.</p>
        </div>
        <PacingBoard />
      </section>

      <section className="mn-band" aria-labelledby="pain">
        <div className="mn-wrap mn-band-inner">
          <h2 id="pain">Most agencies find out about a blown budget on the 31st.</h2>
          <p>
            By then the money is spent and the client call is awkward. Pacing lives in four ad platforms and a spreadsheet that&apos;s stale by noon.
            {" "}{site.appName} checks every account every day and tells you which ones need a change while a change still matters.
          </p>
        </div>
      </section>

      <section id="how-it-works" className="mn-section mn-wrap" aria-labelledby="month-title">
        <h2 id="month-title" className="mn-h2">How a month runs in {site.appName}</h2>
        <ol className="mn-month">
          {MONTH.map((m) => (
            <li key={m.when}>
              <p className="mn-when">{m.when}</p>
              <h3>{m.title}</h3>
              <p>{m.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="sources" className="mn-section mn-wrap mn-split" aria-labelledby="sources-title">
        <div>
          <h2 id="sources-title" className="mn-h2">Every number a local business gets judged on, in one place</h2>
          <p className="mn-body">
            Ad spend and results sit next to website traffic, search rankings, Business Profile activity and tracked phone calls.
            Results are counted once per account, and calls from ads are shown alongside conversions, never added on top, so a client never sees a number inflated twice.
          </p>
        </div>
        <div className="mn-sources">
          {SOURCES.map((g) => (
            <div key={g.group}>
              <h3>{g.group}</h3>
              <ul>
                {g.items.map((i) => <li key={i}>{i}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="mn-section mn-wrap mn-split mn-split-flip" aria-labelledby="reports-title">
        <div>
          <h2 id="reports-title" className="mn-h2">Reports in your name, written for business owners</h2>
          <ul className="mn-points">
            <li><strong>Your brand.</strong> Your agency name, logo and color on every report and client dashboard.</li>
            <li><strong>Plain language.</strong> Each report leads with what happened, what it cost per lead, call or sale, and what you&apos;re doing next.</li>
            <li><strong>Drafts, not guesses.</strong> AI drafts the summary and the client email from the report&apos;s own figures. It never invents a number, and you review everything before it&apos;s sent.</li>
            <li><strong>Client logins.</strong> Give a client their own dashboard, or send a private link that needs no account.</li>
          </ul>
        </div>
        <figure className="mn-report" aria-label="Example client report summary, sample data">
          <div className="mn-report-head">
            <span className="mn-report-agency">Your agency</span>
            <span>October report for Summit Heating &amp; Air</span>
            <span className="mn-board-sample">Sample data</span>
          </div>
          <div className="mn-report-stats">
            <div><span>Leads</span><strong>142</strong><em>up 18% on September</em></div>
            <div><span>Cost per lead</span><strong>$41.20</strong><em>down $6.10</em></div>
            <div><span>Calls from ads</span><strong>97</strong><em>from CallRail</em></div>
          </div>
          <div className="mn-report-next">
            <p className="mn-report-label">What we&apos;re doing next</p>
            <p>Moving budget from the furnace-repair campaign to AC tune-ups, which brought in leads at half the cost this month.</p>
          </div>
        </figure>
      </section>

      <section id="security" className="mn-section mn-wrap" aria-labelledby="security-title">
        <div className="mn-trust">
          <h2 id="security-title" className="mn-h2">Read-only, by design</h2>
          <div className="mn-trust-grid">
            <p>
              When an ad account is connected, {site.appName} asks Google, Meta or Microsoft for read-only access to that account&apos;s reporting data.
              It never creates, changes or pauses campaigns, ads or budgets.
            </p>
            <p>
              The data is used only to produce reports for your agency and the client the account belongs to. It is never sold or used for advertising,
              and access can be removed at any time. The <Link href="/privacy">privacy policy</Link> explains exactly what is collected and how to have it deleted.
            </p>
          </div>
        </div>
      </section>

      <section className="mn-section mn-wrap" aria-labelledby="built-title">
        <div className="mn-founder">
          <h2 id="built-title">Built by people who&apos;ve run the accounts</h2>
          <p>
            {site.appName} comes from nearly twenty years in paid media, including building and selling a white-label PPC agency that managed around 150 recurring client accounts.
            Every screen exists because a real agency month needed it: the 7am pacing check, the client who asks why leads dipped, the report due Friday.
          </p>
        </div>
      </section>

      <section id="request-access" className="mn-cta" aria-labelledby="cta-title">
        <div className="mn-wrap mn-cta-inner">
          <div>
            <h2 id="cta-title">Bring your client list. We&apos;ll connect the first accounts with you.</h2>
            <p>
              {site.appName} is onboarding agencies one at a time while it&apos;s in early access. Tell us a little about your accounts and we&apos;ll set up a walkthrough.
            </p>
            <p className="mn-cta-signin">
              Already have an account? <a href={appLink("/login")}>Sign in</a>
            </p>
          </div>
          <EarlyAccessForm />
        </div>
      </section>
    </>
  );
}
