"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Copies the summary as formatted HTML (with a plain-text fallback) for pasting into an email. */
export function CopySummaryButton({ html, text }: { html: string; text: string }) {
  const [done, setDone] = useState<"ok" | "error" | null>(null);
  const copy = async () => {
    try {
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard.write) {
        await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([text], { type: "text/plain" }) })]);
      } else {
        await navigator.clipboard.writeText(text);
      }
      setDone("ok");
    } catch {
      setDone("error");
    }
    setTimeout(() => setDone(null), 2500);
  };
  return (
    <Button type="button" variant="outline" size="sm" onClick={copy} aria-live="polite">
      {done === "ok" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      {done === "ok" ? "Copied" : done === "error" ? "Couldn't copy" : "Copy for email"}
    </Button>
  );
}
