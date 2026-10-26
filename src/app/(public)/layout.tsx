import Link from "next/link";
import { appLink, site } from "@/lib/site";
import { BrandMark } from "@/components/brand-mark";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-[960px] flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold"><BrandMark className="h-6 w-6" />{site.appName}</Link>
          <nav className="flex items-center gap-4 text-sm text-text-2" aria-label="Site">
            <Link href="/privacy" className="hover:text-text">Privacy</Link>
            <Link href="/terms" className="hover:text-text">Terms</Link>
            <a href={appLink("/login")} className="rounded-md bg-brand px-3 py-1.5 font-medium text-brand-ink hover:opacity-90">Sign in</a>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[960px] flex-1 px-4 py-10 md:px-6">{children}</main>
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-[960px] flex-wrap justify-between gap-2 px-4 py-4 text-xs text-text-3 md:px-6">
          <span>© {new Date().getFullYear()} {site.company}</span>
          <span className="flex gap-4">
            <Link href="/privacy" className="hover:text-text-2">Privacy policy</Link>
            <Link href="/terms" className="hover:text-text-2">Terms of service</Link>
            {site.contactEmail && <span>{site.contactEmail}</span>}
          </span>
        </div>
      </footer>
    </div>
  );
}
