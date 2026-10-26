import "./landing.css";
import { Inter_Tight } from "next/font/google";
import Link from "next/link";
import Script from "next/script";
import { BrandMark } from "@/components/brand-mark";
import { appLink, site } from "@/lib/site";

// Headline face, self-hosted and preloaded by Next with a size-matched fallback (no layout shift).
const display = Inter_Tight({ subsets: ["latin"], variable: "--font-display", display: "swap" });

// Google Tag Manager for conversion tracking (see ./track.ts). Only loads when configured.
const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID;

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`mn ${display.variable}`}>
      {GTM_ID && /^GTM-[A-Z0-9]+$/.test(GTM_ID) && (
        <Script id="gtm" strategy="afterInteractive">
          {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${GTM_ID}');`}
        </Script>
      )}
      <a href="#main" className="mn-skip">Skip to content</a>
      <header className="mn-header">
        <div className="mn-wrap mn-header-inner">
          <Link href="/" className="mn-logo"><BrandMark className="mn-logo-mark" />{site.appName}</Link>
          <nav aria-label="Site" className="mn-nav">
            <a href="#product" className="mn-nav-link">Product</a>
            <a href="#how" className="mn-nav-link">How it works</a>
            <a href="#why" className="mn-nav-link">Why us</a>
            <a href="#faq" className="mn-nav-link">FAQ</a>
          </nav>
          <a href={appLink("/login")} className="mn-nav-signin">Sign in</a>
          <a href="#start" className="mn-btn mn-btn-primary mn-btn-sm">Get early access</a>
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
