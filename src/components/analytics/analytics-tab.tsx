import { Suspense } from "react";
import { prisma } from "@/server/db";
import { metricBreakdown, metricTotals } from "@/server/metrics/query";
import { addDays, dateToIso, diffDays, minDate, type IsoDate } from "@/lib/pacing/dates";
import type { DateRange } from "@/lib/date-ranges";
import { formatDate } from "@/lib/time";
import { formatNumber, formatPct } from "@/lib/money";
import { SectionSkeleton } from "@/components/ui/skeleton";
import { change, ChangeText, Figure, FigureRow, LeadSentence, NotConnected, ResponsiveRows, Section } from "@/components/channel/parts";

// The client's Analytics tab (Google Analytics 4): visits, website goals (key
// events), where visits came from and which pages they landed on. Every
// sentence is built from the figures shown; nothing here is AI-written.

const n0 = (n: number | null | undefined) => (n == null ? "—" : formatNumber(n, 0));
const short = (d: IsoDate) => formatDate(d, { month: "short", day: "numeric" });
const rate = (goals: number | null | undefined, visits: number | null | undefined) => (goals != null && visits ? (goals / visits) * 100 : null);

export function AnalyticsTab(props: { clientId: string; range: DateRange; cmpRange: DateRange | null; canEdit: boolean }) {
  return (
    <Suspense fallback={<SectionSkeleton tiles={4} cards={2} tallFirst={false} />}>
      <AnalyticsContent {...props} />
    </Suspense>
  );
}

async function AnalyticsContent({ clientId, range, cmpRange, canEdit }: { clientId: string; range: DateRange; cmpRange: DateRange | null; canEdit: boolean }) {
  const ga4 = await prisma.dataAsset.findFirst({ where: { clientId, kind: "GA4_PROPERTY" }, select: { name: true, dataCompleteThrough: true } });
  if (!ga4) {
    return (
      <NotConnected
        title="Google Analytics isn't connected for this client yet"
        body="Connect the client's Google Analytics 4 property to see website visits, the goals visitors complete (form fills, calls, bookings…), where visits come from and which pages they land on."
        actions={[{ href: "/integrations", label: canEdit ? "Connect Google Analytics" : "Open connections", primary: canEdit }]}
      />
    );
  }

  const through = ga4.dataCompleteThrough ? dateToIso(ga4.dataCompleteThrough) : null;
  const to = through ? minDate(range.to, through) : range.to;
  const days = diffDays(range.from, to) + 1;
  const cur = { from: range.from, to };
  // Same number of days as the current window, never past the comparison range's own end.
  const prev = cmpRange ? { from: cmpRange.from, to: minDate(addDays(cmpRange.from, days - 1), cmpRange.to) } : null;
  if (days < 1) {
    return <NotConnected title="No complete Google Analytics days in this range yet" body={`The latest complete day is ${through ? short(through) : "not available yet"}. Choose a longer range, such as the last 30 days.`} actions={[]} />;
  }
  const keys = ["ga4.sessions", "ga4.keyEvents", "ga4.engagementRate", "ga4.newUsers"];
  const [now, before, channels, channelsBefore, pages, pagesBefore] = await Promise.all([
    metricTotals(clientId, keys, cur.from, cur.to),
    prev ? metricTotals(clientId, keys, prev.from, prev.to) : null,
    metricBreakdown(clientId, "channel", ["ga4.sessions", "ga4.keyEvents"], cur.from, cur.to, 12),
    prev ? metricBreakdown(clientId, "channel", ["ga4.sessions", "ga4.keyEvents"], prev.from, prev.to, 30) : [],
    metricBreakdown(clientId, "page", ["ga4.sessions", "ga4.keyEvents"], cur.from, cur.to, 10),
    prev ? metricBreakdown(clientId, "page", ["ga4.sessions", "ga4.keyEvents"], prev.from, prev.to, 200) : [],
  ]);
  const cb = new Map(channelsBefore.map((c) => [c.value, c.metrics]));
  const pb = new Map(pagesBefore.map((p) => [p.value, p.metrics]));

  const visits = now["ga4.sessions"];
  const goals = now["ga4.keyEvents"];
  const visitsBefore = before?.["ga4.sessions"] ?? null;
  const goalsBefore = before?.["ga4.keyEvents"] ?? null;

  const lead: string[] = [];
  const pct = (a: number, b: number) => ((a - b) / b) * 100;
  if (visits != null && visitsBefore) {
    const v = pct(visits, visitsBefore);
    lead.push(Math.abs(v) < 5 ? `Website visits held steady at ${n0(visits)}` : `Website visits ${v < 0 ? "fell" : "rose"} ${Math.round(Math.abs(v))}% (${n0(visitsBefore)} → ${n0(visits)})`);
    if (goals != null && goalsBefore) {
      const g = pct(goals, goalsBefore);
      lead[0] += Math.abs(g) < 5 ? ` and website goals held at ${n0(goals)}.` : ` and website goals ${g < 0 ? "fell" : "rose"} ${Math.round(Math.abs(g))}% (${n0(goalsBefore)} → ${n0(goals)}).`;
      // Which channel moved goals the most, when one stands out.
      const net = goals - goalsBefore;
      const movers = channels.map((c) => ({ name: c.value, d: (c.metrics["ga4.keyEvents"] ?? 0) - (cb.get(c.value)?.["ga4.keyEvents"] ?? 0), now: c.metrics["ga4.keyEvents"] ?? 0, before: cb.get(c.value)?.["ga4.keyEvents"] ?? 0 }));
      const top = net !== 0 ? movers.filter((m) => Math.sign(m.d) === Math.sign(net)).sort((a, b) => Math.abs(b.d) - Math.abs(a.d))[0] : undefined;
      if (Math.abs(g) >= 5 && top && Math.abs(top.d) >= Math.max(3, Math.abs(net) * 0.4)) lead.push(`${Math.abs(top.d) >= Math.abs(net) * 0.7 ? "Most of the change" : "The biggest change"} is ${top.name.toLowerCase()}: ${n0(top.before)} → ${n0(top.now)} goals.`);
    } else lead[0] += ".";
  } else if (visits != null) {
    lead.push(`${n0(visits)} website visits and ${n0(goals)} website goals ${short(cur.from)}–${short(cur.to)}.`);
  }

  const goalRate = rate(goals, visits);
  const goalRateBefore = rate(goalsBefore, visitsBefore);
  const cmp = prev ? `vs ${short(prev.from)}–${short(prev.to)}` : null;
  const totalVisits = channels.reduce((s, c) => s + (c.metrics["ga4.sessions"] ?? 0), 0) || 1;

  return (
    <div className="flex flex-col gap-6">
      <LeadSentence note={<>Google Analytics 4 · {ga4.name} · {through ? `through ${short(through)}` : "not synced yet"} ({short(cur.from)}–{short(cur.to)}{cmp ? `, ${cmp}` : ""}). “Website goals” are the key events marked in the property.</>}>
        {lead.join(" ") || "No website data for this period yet."}
      </LeadSentence>

      <FigureRow>
        <Figure label="Website visits" info="Sessions: visits to the site, from any source." value={n0(visits)} sub={<ChangeText c={change(visits, visitsBefore, "up", (x) => formatNumber(x, 0))} />} />
        <Figure label="Website goals" info="Key events marked in Google Analytics (for example form submissions, calls or bookings), from every channel." value={n0(goals)} sub={<ChangeText c={change(goals, goalsBefore, "up", (x) => formatNumber(x, 0), goals != null && goalsBefore != null ? { current: goals, previous: goalsBefore } : undefined)} />} />
        <Figure label="Visits that reached a goal" info="Website goals ÷ visits." value={goalRate === null ? "—" : formatPct(goalRate)} sub={goalRateBefore !== null && <span className="text-[13px] text-text-2">was {formatPct(goalRateBefore)}</span>} />
        <Figure label="Engaged visits" info="Visits that lasted 10+ seconds, reached a goal, or viewed 2+ pages." value={now["ga4.engagementRate"] == null ? "—" : formatPct(now["ga4.engagementRate"])} sub={before?.["ga4.engagementRate"] != null && <span className="text-[13px] text-text-2">was {formatPct(before["ga4.engagementRate"])}</span>} />
      </FigureRow>

      {channels.length > 0 && (
        <Section title="Where visits came from" aside="Google Analytics channel groups" footer="Google Analytics credits a goal to the channel of the visit it happened in. Ad platforms credit their ads within their own windows, so paid totals here won't match the Paid Ads tab.">
          <ResponsiveRows
            rows={channels}
            rowKey={(c) => c.value}
            head={[{ label: "Channel" }, { label: "Visits", align: "right" }, { label: "Change", align: "right" }, { label: "Goals", align: "right" }, { label: "Change", align: "right" }, { label: "Goal rate", align: "right" }]}
            cells={(c) => {
              const b = cb.get(c.value);
              const share = ((c.metrics["ga4.sessions"] ?? 0) / totalVisits) * 100;
              return [
                <span key="n" className="flex items-center gap-2 font-medium"><span aria-hidden className="inline-block h-1.5 rounded-full bg-[var(--series-1,#2f6fdb)]" style={{ width: `${Math.max(4, share)}px` }} />{c.value}</span>,
                n0(c.metrics["ga4.sessions"]),
                prev ? <Delta key="v" now={c.metrics["ga4.sessions"]} before={b?.["ga4.sessions"] ?? 0} /> : "—",
                n0(c.metrics["ga4.keyEvents"]),
                prev ? <Delta key="g" now={c.metrics["ga4.keyEvents"]} before={b?.["ga4.keyEvents"] ?? 0} /> : "—",
                formatPct(rate(c.metrics["ga4.keyEvents"], c.metrics["ga4.sessions"])),
              ];
            }}
            mobile={(c) => (
              <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 [&>*:nth-child(even)]:text-right">
                <span className="text-sm font-medium">{c.value}</span>
                <span className="text-sm font-semibold tabular">{n0(c.metrics["ga4.keyEvents"])} goals</span>
                <span className="text-[13px] text-text-2">{n0(c.metrics["ga4.sessions"])} visits · {formatPct(rate(c.metrics["ga4.keyEvents"], c.metrics["ga4.sessions"]))}</span>
                {prev ? <Delta now={c.metrics["ga4.keyEvents"]} before={cb.get(c.value)?.["ga4.keyEvents"] ?? 0} /> : <span />}
              </div>
            )}
          />
        </Section>
      )}

      {pages.length > 0 && (
        <Section title="Pages people landed on" aside="Top 10 by visits">
          <ResponsiveRows
            rows={pages}
            rowKey={(p) => p.value}
            head={[{ label: "Page" }, { label: "Visits", align: "right" }, { label: "Change", align: "right" }, { label: "Goals", align: "right" }, { label: "Change", align: "right" }]}
            cells={(p) => {
              const b = pb.get(p.value);
              return [
                <span key="p" className="block max-w-[28rem] truncate font-medium" title={p.value}>{p.value || "/"}</span>,
                n0(p.metrics["ga4.sessions"]),
                prev ? <Delta key="v" now={p.metrics["ga4.sessions"]} before={b?.["ga4.sessions"] ?? 0} /> : "—",
                n0(p.metrics["ga4.keyEvents"]),
                prev ? <Delta key="g" now={p.metrics["ga4.keyEvents"]} before={b?.["ga4.keyEvents"] ?? 0} /> : "—",
              ];
            }}
            mobile={(p) => (
              <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 [&>*:nth-child(even)]:text-right">
                <span className="truncate text-sm font-medium">{p.value || "/"}</span>
                <span className="text-sm font-semibold tabular">{n0(p.metrics["ga4.sessions"])} visits</span>
                <span className="text-[13px] text-text-2">{n0(p.metrics["ga4.keyEvents"])} goals</span>
                {prev ? <Delta now={p.metrics["ga4.sessions"]} before={pb.get(p.value)?.["ga4.sessions"] ?? 0} /> : <span />}
              </div>
            )}
          />
        </Section>
      )}
    </div>
  );
}

function Delta({ now, before }: { now: number | null; before: number }) {
  const d = (now ?? 0) - before;
  if (d === 0) return <span className="text-[13px] text-text-2">same</span>;
  return <span className={`text-[13px] ${d > 0 ? "text-good-ink" : "text-critical-ink"}`}>{d > 0 ? "+" : "−"}{formatNumber(Math.abs(d), 0)}</span>;
}
