import { prisma } from "@/server/db";
import { requireAdmin } from "@/server/access";
import { emailConfigured } from "@/server/email";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export const dynamic = "force-dynamic";

const STATUS = {
  SENT: { label: "Sent", variant: "good" },
  FAILED: { label: "Failed", variant: "critical" },
  NOT_CONFIGURED: { label: "Not sent — no email provider", variant: "warning" },
} as const;

export default async function EmailLogPage() {
  const admin = await requireAdmin();
  const messages = await prisma.emailMessage.findMany({ where: { agencyId: admin.agencyId }, orderBy: { createdAt: "desc" }, take: 200 });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Email log</CardTitle>
        <CardDescription>
          {emailConfigured()
            ? "Email is sent through the SMTP server in SMTP_URL, from EMAIL_FROM."
            : "No email provider is configured (set SMTP_URL and EMAIL_FROM). Emails are recorded here but not delivered."}{" "}
          One-time links are removed from stored copies.
        </CardDescription>
      </CardHeader>
      {/* Phones: one card per email instead of a five-column table. */}
      <ul className="flex flex-col gap-2 px-3 md:hidden" aria-label="Emails">
        {messages.map((m) => (
          <li key={m.id} className="rounded-lg border border-border p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-text-2">{m.createdAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · {m.kind.replace("_", " ")}</span>
              <Badge variant={STATUS[m.status].variant}>{STATUS[m.status].label}</Badge>
            </div>
            <p className="mt-1 break-all text-text-2">To {m.to}</p>
            <details className="mt-1">
              <summary className="cursor-pointer font-medium">{m.subject}</summary>
              <pre className="mt-2 whitespace-pre-wrap text-xs text-text-2">{m.text}</pre>
            </details>
            {m.error && <p className="mt-1 text-xs text-critical-ink">{m.error}</p>}
          </li>
        ))}
        {messages.length === 0 && <li className="px-2 py-8 text-center text-sm text-text-3">No emails yet.</li>}
      </ul>
      <div className="hidden md:block">
      <Table>
        <THead><tr><TH className="pl-5">When</TH><TH>To</TH><TH>Subject</TH><TH>Type</TH><TH className="pr-5">Status</TH></tr></THead>
        <TBody>
          {messages.map((m) => (
            <TR key={m.id}>
              <TD className="pl-5 text-text-2">{m.createdAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</TD>
              <TD>{m.to}</TD>
              <TD className="max-w-md whitespace-normal">
                <details>
                  <summary className="cursor-pointer">{m.subject}</summary>
                  <pre className="mt-2 whitespace-pre-wrap text-xs text-text-2">{m.text}</pre>
                </details>
              </TD>
              <TD className="text-text-2">{m.kind.replace("_", " ")}</TD>
              <TD className="pr-5"><Badge variant={STATUS[m.status].variant}>{STATUS[m.status].label}</Badge>{m.error && <div className="text-xs text-critical-ink">{m.error}</div>}</TD>
            </TR>
          ))}
          {messages.length === 0 && <tr><td colSpan={5} className="px-5 py-8 text-center text-sm text-text-3">No emails yet.</td></tr>}
        </TBody>
      </Table>
      </div>
      <div className="h-3" />
    </Card>
  );
}
