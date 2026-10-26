import "@fontsource-variable/bricolage-grotesque";
import "./landing.css";
import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { appLink, site } from "@/lib/site";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mn">
      <a href="#main" className="mn-skip">Skip to content</a>
      <header className="mn-header">
        <div className="mn-wrap mn-header-inner">
          <Link href="/" className="mn-logo"><BrandMark className="mn-logo-mark" />{site.appName}</Link>
          <nav aria-label="Site" className="mn-nav">
            <a href="#how-it-works" className="mn-nav-link">How it works</a>
            <a href="#sources" className="mn-nav-link">Data sources</a>
            <a href="#security" className="mn-nav-link">Security</a>
            <a href={appLink("/login")} className="mn-nav-signin">Sign in</a>
            <a href="#request-access" className="mn-btn mn-btn-primary mn-btn-sm">Request access</a>
          </nav>
        </div>
      </header>
      <main id="main">{children}</main>
      <footer className="mn-footer">
        <div className="mn-wrap mn-footer-inner">
          <span className="mn-logo mn-logo-sm"><BrandMark className="mn-logo-mark" />{site.appName}</span>
          <span className="mn-footer-links">
            <Link href="/privacy">Privacy policy</Link>
            <Link href="/terms">Terms of service</Link>
            {site.contactEmail && <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>}
          </span>
          <span className="mn-footer-copy">© {new Date().getFullYear()} {site.company}</span>
        </div>
      </footer>
    </div>
  );
}
