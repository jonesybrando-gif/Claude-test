import Link from "next/link";
import { BarChart3, Bell, Building2, Gauge, LineChart, Plug, Settings, LogOut } from "lucide-react";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { visibleClientsWhere } from "@/server/access";
import { logout } from "@/app/login/actions";
import { CommandPalette, type PaletteItem } from "@/components/command-palette";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [agency, clients, unread] = await Promise.all([
    prisma.agency.findUniqueOrThrow({ where: { id: user.agencyId }, select: { name: true, brandColor: true, logoUrl: true } }),
    prisma.client.findMany({ where: visibleClientsWhere(user), select: { id: true, name: true }, orderBy: { name: "asc" } }),
    user.role === "CLIENT_USER" ? Promise.resolve(0) : prisma.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);
  const staff = user.role !== "CLIENT_USER";
  const nav = [
    ...(staff ? [{ href: "/performance", label: "Performance", Icon: LineChart }] : []),
    ...(staff ? [{ href: "/dashboard", label: "Budget pacing", Icon: Gauge }] : []),
    ...(staff ? [{ href: "/alerts", label: "Alerts", Icon: Bell, count: unread }] : []),
    { href: staff ? "/clients" : `/clients/${user.clientId}`, label: staff ? "Clients" : "My reports", Icon: staff ? Building2 : BarChart3 },
    ...(staff ? [{ href: "/integrations", label: "Integrations", Icon: Plug }] : []),
    ...(user.role === "AGENCY_ADMIN" ? [{ href: "/settings", label: "Settings", Icon: Settings }] : []),
  ];

  // Search / Cmd-K: every visible client plus the main pages.
  const paletteItems: PaletteItem[] = staff
    ? [
        ...nav.map((n) => ({ href: n.href, label: n.label, kind: "Page" as const })),
        ...(user.role === "AGENCY_ADMIN"
          ? [
              { href: "/settings/team", label: "Team", kind: "Page" as const, hint: "Settings" },
              { href: "/settings/reports", label: "Reports and schedules", kind: "Page" as const, hint: "Settings" },
              { href: "/settings/alerts", label: "Alert settings and Slack", kind: "Page" as const, hint: "Settings" },
            ]
          : []),
        { href: "/account", label: "Your account", kind: "Page" as const },
        ...clients.map((c) => ({ href: `/clients/${c.id}`, label: c.name, kind: "Client" as const })),
      ]
    : [];

  return (
    <div className="min-h-screen md:flex" style={{ ["--brand" as string]: agency.brandColor }}>
      <aside className="border-b border-border bg-surface md:sticky md:top-0 md:h-screen md:w-60 md:shrink-0 md:border-r md:border-b-0">
        <div className="flex items-center gap-2 px-4 py-4">
          {agency.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={agency.logoUrl} alt="" className="h-7 w-7 rounded" />
          ) : (
            <div className="flex h-7 w-7 items-center justify-center rounded bg-brand text-xs font-bold text-brand-ink">
              {agency.name.slice(0, 1)}
            </div>
          )}
          <span className="truncate text-sm font-semibold">{agency.name}</span>
        </div>
        {staff && (
          <div className="px-3 pb-2 md:pb-3">
            <CommandPalette items={paletteItems} />
          </div>
        )}
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:pb-0">
          {nav.map(({ href, label, Icon, ...rest }) => {
            const count = "count" in rest ? (rest.count as number) : 0;
            return (
              <Link key={href} href={href} className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-text-2 hover:bg-surface-2 hover:text-text whitespace-nowrap">
                <Icon className="h-4 w-4" aria-hidden />
                {label}
                {count > 0 && <span className="ml-auto rounded-full bg-critical px-1.5 text-[11px] font-semibold text-white tabular" aria-label={`${count} unread`}>{count > 99 ? "99+" : count}</span>}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2 md:absolute md:bottom-0 md:block md:w-60 md:py-3">
          <Link href="/account" className="block truncate text-sm font-medium hover:underline">{user.name}</Link>
          <p className="truncate text-xs text-text-3">{user.role.replace("_", " ").toLowerCase()}</p>
          <form action={logout}>
            <button className="mt-2 inline-flex items-center gap-1.5 text-xs text-text-2 hover:text-text cursor-pointer">
              <LogOut className="h-3.5 w-3.5" aria-hidden /> Sign out
            </button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8">{children}</main>
    </div>
  );
}
