"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/settings", label: "Pacing & branding" },
  { href: "/settings/team", label: "Team" },
  { href: "/settings/reports", label: "Reports" },
  { href: "/settings/dashboards", label: "Dashboards" },
  { href: "/settings/alerts", label: "Alerts" },
  { href: "/settings/email", label: "Email log" },
];

export function SettingsTabs() {
  const path = usePathname();
  return (
    <nav className="mt-3 flex gap-1 overflow-x-auto border-b border-border" aria-label="Settings sections">
      {TABS.map((t) => {
        const active = path === t.href;
        return (
          <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined} className={`-mb-px border-b-2 px-3 py-2 text-sm whitespace-nowrap ${active ? "border-brand font-medium text-text" : "border-transparent text-text-2 hover:text-text"}`}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
