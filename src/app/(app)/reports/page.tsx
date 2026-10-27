import Link from "next/link";
import { requireAgencyStaff, visibleClientsWhere } from "@/server/access";
import { prisma } from "@/server/db";
import { listAgencySchedules } from "@/server/scheduled-reports";
import { describeSchedule } from "@/lib/report-schedule";
import { relativeTime } from "@/lib/time";
import { Card } from "@/components/ui/card";
import { Dot } from "@/components/status-dot";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reports" };

/**
 * Agency-wide: how each client gets its report (scheduled email, share links,
 * client logins) and when it was last seen. Each row opens the client's Reports tab.
 */
export default async function ReportsPage() {
  const user = await requireAgencyStaff();
  const now = new Date();
  const clients = await prisma.client.findMany({
    where: visibleClientsWhere(user),
    select: {
      id: true,
      name: true,
      shareLinks: { where: { revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }, select: { lastViewedAt: true } },
      users: { where: { deactivatedAt: null }, select: { lastLoginAt: true } },
    },
    orderBy: { name: "asc" },
  });
  const schedules = new Map((await listAgencySchedules(user.agencyId)).map((s) => [s.client.id, s.schedule]));
  const rows = clients.map((c) => {
    const s = schedules.get(c.id);
    const seen = [...c.shareLinks.map((l) => l.lastViewedAt), ...c.users.map((u) => u.lastLoginAt)].filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
    return {
      id: c.id,
      name: c.name,
      schedule: s?.enabled ? describeSchedule({ frequency: s.frequency === "weekly" ? "weekly" : "monthly", dayOfMonth: s.dayOfMonth, dayOfWeek: s.dayOfWeek }) : null,
      lastSent: s?.lastSentAt ?? null,
      links: c.shareLinks.length,
      logins: c.users.length,
      seen,
    };
  });
  const unshared = rows.filter((r) => !r.schedule && r.links === 0 && r.logins === 0).length;

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="max-w-[70ch] text-sm text-text-2">
          How each client gets their report and when they last looked at it.{" "}
          {unshared > 0 ? <>{unshared} client{unshared === 1 ? " doesn't" : "s don't"} get a report yet.</> : "Every client gets a report."}
        </p>
      </div>
      <Card className="overflow-hidden">
        <ul className="divide-y divide-border md:hidden">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/clients/${r.id}?tab=reports`} className="flex flex-col gap-0.5 px-5 py-3 hover:bg-surface-2">
                <span className="text-sm font-medium">{r.name}</span>
                <span className="text-[13px] text-text-2">
                  {r.schedule ?? "Not scheduled"} · {r.links === 0 && r.logins === 0 ? "not shared" : [r.links > 0 && `${r.links} link${r.links === 1 ? "" : "s"}`, r.logins > 0 && `${r.logins} login${r.logins === 1 ? "" : "s"}`].filter(Boolean).join(" · ")}
                </span>
                <span className="text-[13px] text-text-3">Last seen {r.seen ? relativeTime(r.seen.toISOString()).toLowerCase() : "never"}</span>
              </Link>
            </li>
          ))}
        </ul>
        <div className="max-md:hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-text-2">
                <th scope="col" className="px-5 py-3 font-medium">Client</th>
                <th scope="col" className="px-4 py-3 font-medium">Emailed</th>
                <th scope="col" className="px-4 py-3 font-medium">Shared</th>
                <th scope="col" className="px-4 py-3 font-medium">Last seen by the client</th>
                <th scope="col" className="px-5 py-3"><span className="sr-only">Open</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-surface-2">
                  <td className="px-5 py-3 font-medium"><Link href={`/clients/${r.id}?tab=reports`} className="hover:underline">{r.name}</Link></td>
                  <td className="px-4 py-3">
                    {r.schedule ? (
                      <span className="flex items-center gap-2"><Dot tone="good" /> {r.schedule}{r.lastSent && <span className="text-text-3"> · sent {relativeTime(r.lastSent.toISOString()).toLowerCase()}</span>}</span>
                    ) : (
                      <span className="text-text-3">Not scheduled</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-text-2">
                    {r.links === 0 && r.logins === 0 ? <span className="text-text-3">Not shared</span> : [r.links > 0 && `${r.links} link${r.links === 1 ? "" : "s"}`, r.logins > 0 && `${r.logins} login${r.logins === 1 ? "" : "s"}`].filter(Boolean).join(" · ")}
                  </td>
                  <td className="px-4 py-3 text-text-2">{r.seen ? relativeTime(r.seen.toISOString()) : <span className="text-text-3">Never</span>}</td>
                  <td className="px-5 py-3 text-right"><Link href={`/clients/${r.id}?tab=reports`} className="font-medium text-brand-text hover:underline">Open</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {user.role === "AGENCY_ADMIN" && <p className="text-sm text-text-3">Report layout, sections and the agency default range are under <Link href="/settings/reports" className="text-brand-text hover:underline">Settings › Reports</Link>.</p>}
    </div>
  );
}
