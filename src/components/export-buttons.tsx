import { Download, FileText } from "lucide-react";
import { buttonVariants } from "./ui/button";

/** URL of a report export (pdf/csv) that keeps the current date range. */
export function exportHref(base: string, query: Record<string, string | undefined> | undefined, kind: string, extra = ""): string {
  const qs = new URLSearchParams(Object.entries(query ?? {}).filter(([k, v]) => v && ["range", "compare", "from", "to"].includes(k)) as [string, string][]).toString();
  return `${base}/${kind}${qs || extra ? `?${[qs, extra].filter(Boolean).join("&")}` : ""}`;
}

/** Download links for the report endpoints, keeping the current date range. */
export function ExportButtons({ base, query, internalPdf }: { base: string; query?: Record<string, string | undefined>; internalPdf?: boolean }) {
  const href = (kind: string, extra = "") => exportHref(base, query, kind, extra);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <a href={href("pdf")} download className={buttonVariants({ variant: "outline" })}>
        <FileText className="h-4 w-4" aria-hidden /> PDF
      </a>
      {internalPdf && (
        <a href={href("pdf", "internal=1")} download className={buttonVariants({ variant: "outline" })} title="PDF including internal recommendations — not for sending to the client">
          <FileText className="h-4 w-4" aria-hidden /> PDF + notes
        </a>
      )}
      <a href={href("csv")} download className={buttonVariants({ variant: "outline" })}>
        <Download className="h-4 w-4" aria-hidden /> CSV
      </a>
    </div>
  );
}
