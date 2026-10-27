import type { Metadata } from "next";
import Link from "next/link";
import { site } from "@/lib/site";
import { Contact, LegalPage } from "../legal";

// Names and contact come from environment variables at request time.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: `Terms of service · ${site.appName}` };

export default function TermsPage() {
  const app = site.appName;
  const co = site.company;
  return (
    <LegalPage
      title="Terms of service"
      intro={<p>These terms apply to anyone who signs in to {app}, connects an ad account to it, or opens a report shared from it. {app} is provided by {co} (&quot;we&quot;) to support the advertising services we provide to our clients. By using it you agree to these terms.</p>}
    >
      <section className="flex flex-col gap-3">
        <h2>The service</h2>
        <p>{app} reports on advertising accounts that have been connected to it, tracks spend against budgets, and produces reports. It reads data from Google Ads, Meta Ads, Microsoft Advertising, Google Analytics, Google Search Console, Google Business Profile and other connected services, and never changes campaigns, ads, budgets, billing, website settings or business listings in those services. Any change to an account is made by a person, separately.</p>
      </section>

      <section className="flex flex-col gap-3">
        <h2>Accounts and access</h2>
        <ul>
          <li>Keep your sign-in details confidential. You are responsible for activity under your account.</li>
          <li>Connect only ad accounts you are authorized to share with us.</li>
          <li>Report links give anyone who has them read access to that report. Share them only with people who should see it; they can be turned off at any time.</li>
          <li>Don&apos;t attempt to access data you weren&apos;t given access to, disrupt the service, or use it in breach of the ad platforms&apos; own terms.</li>
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2>Accuracy of reports</h2>
        <p>Figures come from the ad platforms and can be revised by them for several days. Conversions are counted by each platform under its own attribution settings, so platforms are not directly comparable. Some figures are estimates, such as Local Services Ads spend where the platform does not report cost, and are labelled as such. Summaries and drafts written by the optional AI features are generated automatically from the report figures and may contain mistakes; check them before relying on them. Reports are provided for information and are not financial advice.</p>
      </section>

      <section className="flex flex-col gap-3">
        <h2>Your data</h2>
        <p>Advertising data remains yours (or your client&apos;s). We use it only as described in the <Link className="underline" href="/privacy">privacy policy</Link>, and delete it on request.</p>
      </section>

      <section className="flex flex-col gap-3">
        <h2>Availability and changes</h2>
        <p>We aim to keep {app} available but don&apos;t guarantee uninterrupted service, and depend on the ad platforms&apos; own services being available. We may change or discontinue features, and will give reasonable notice of significant changes. We may suspend access that breaches these terms.</p>
      </section>

      <section className="flex flex-col gap-3">
        <h2>Liability</h2>
        <p>{app} is provided &quot;as is&quot;. To the extent the law allows, we are not liable for indirect or consequential losses, or for decisions made using its reports. Nothing in these terms limits liability that cannot be limited by law, or changes any separate agreement between {co} and its clients, which takes precedence where the two differ.</p>
      </section>

      <section className="flex flex-col gap-3">
        <h2>Contact</h2>
        <p>Questions about these terms: <Contact />.</p>
      </section>
    </LegalPage>
  );
}
