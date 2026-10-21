"use client";

import { useState, useTransition } from "react";
import { MessageSquare } from "lucide-react";
import { askQuestionAction } from "@/server/ai/actions";
import { Button } from "@/components/ui/button";

const EXAMPLES = [
  "What are the top performing headlines?",
  "Which keywords are wasting the most spend?",
  "Which search terms should we add as negatives?",
  "Which ads should we pause or replace?",
  "Which campaign should get more budget?",
];

/** Renders the answer's paragraphs and "- " bullet lists. */
function AnswerText({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);
  return (
    <div className="flex flex-col gap-2 text-sm leading-relaxed text-text">
      {blocks.map((b, i) => {
        const lines = b.split("\n");
        if (lines.every((l) => /^\s*(?:[-•*]|\d+[.)])\s+/.test(l))) {
          const numbered = /^\s*\d/.test(lines[0]);
          const List = numbered ? "ol" : "ul";
          return <List key={i} className={`flex flex-col gap-1 pl-5 ${numbered ? "list-decimal" : "list-disc"}`}>{lines.map((l, j) => <li key={j}>{l.replace(/^\s*(?:[-•*]|\d+[.)])\s+/, "")}</li>)}</List>;
        }
        return <p key={i} className="whitespace-pre-line">{b}</p>;
      })}
    </div>
  );
}

/** Ask the AI assistant a specific question about this client and period. */
export function AskPanel({ clientId, query }: { clientId: string; query: Record<string, string | undefined> }) {
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<{ question: string; answer: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const ask = (q: string) => {
    if (!q.trim() || pending) return;
    setError(null);
    start(async () => {
      const res = await askQuestionAction(clientId, query, q, turns);
      if (res.answer) {
        setTurns((t) => [...t, { question: q.trim(), answer: res.answer! }]);
        setQuestion("");
      } else setError(res.error ?? "Something went wrong. Try again.");
    });
  };

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold"><MessageSquare className="h-4 w-4 text-brand" aria-hidden /> Ask about this client</h3>
      {turns.map((t, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-lg border border-border p-3">
          <p className="text-sm font-medium">{t.question}</p>
          <AnswerText text={t.answer} />
        </div>
      ))}
      <form onSubmit={(e) => { e.preventDefault(); ask(question); }} className="flex flex-col gap-2">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(question); } }}
          rows={2}
          maxLength={500}
          placeholder={turns.length ? "Ask a follow-up…" : "e.g. What are the top performing headlines?"}
          className="w-full resize-y rounded-md border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand)]"
          aria-label="Question for the AI assistant"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm" disabled={pending || !question.trim()}>{pending ? "Looking into it… (up to a minute)" : "Ask"}</Button>
          {turns.length > 0 && !pending && <Button type="button" variant="ghost" size="sm" onClick={() => setTurns([])}>Clear</Button>}
          {error && <p className="text-xs text-critical-ink" role="alert">{error}</p>}
        </div>
      </form>
      {turns.length === 0 && (
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button key={ex} type="button" disabled={pending} onClick={() => { setQuestion(ex); ask(ex); }} className="rounded-full border border-border px-3 py-1 text-xs text-text-2 hover:bg-surface-2 hover:text-text disabled:opacity-50">
              {ex}
            </button>
          ))}
        </div>
      )}
      <p className="text-xs text-text-3">Answers use this page&apos;s date range. For ads, headlines, keywords and search terms the assistant reads live data from Google Ads and Meta (read-only). Check before acting; only your team sees this.</p>
    </div>
  );
}
