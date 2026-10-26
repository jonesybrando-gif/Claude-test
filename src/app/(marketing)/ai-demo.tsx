"use client";

import { useState } from "react";
import { track } from "./track";

// The hero demonstration: one sample client, three questions an account
// manager actually asks, and answers that keep what the data shows, what may
// explain it and what to do next visibly apart. All figures are sample data.

type Source = "Google Ads" | "Analytics" | "Search Console" | "Rankings" | "Budget";
type Observation = { source: Source; text: string };
type Action = { priority: "First" | "Next" | "Then"; text: string };
type Answer = { headline: string; observations: Observation[]; explanation: string; actions: Action[] };

const QUESTIONS: { id: string; ask: string; answer: Answer }[] = [
  {
    id: "leads",
    ask: "Why are new patient leads down this month?",
    answer: {
      headline: "Most of the drop came through organic search, in the same weeks two high-intent keywords slipped out of the top 3.",
      observations: [
        { source: "Analytics", text: "Website goals 152, down from 188 (-19%). From organic search: 38, down from 57 (-33%). From paid search: 114 vs 131." },
        { source: "Search Console", text: "Clicks from Google Search 1,702, down from 2,315 (-26%), with impressions about the same." },
        { source: "Rankings", text: "“emergency dentist” fell from position 2 to 6. “dentist near me” fell from 3 to 9, both since Oct 12." },
        { source: "Google Ads", text: "Leads 118 vs 131 (-10%). Cost per lead $50.76, up from $44.20, as cost per click rose 14%." },
      ],
      explanation:
        "The ranking drops may explain most of the lost organic clicks, because people still see the site but click it less often from lower positions. The smaller paid dip may be competition: clicks got more expensive while the conversion rate held steady.",
      actions: [
        { priority: "First", text: "Bid on “emergency dentist” in the Search campaign while organic recovers. It's already your best paid converter at $41 per lead." },
        { priority: "Next", text: "Check the emergency-dentistry page for changes made around Oct 12, and compare its title with the pages now outranking it." },
        { priority: "Then", text: "Hold paid spend at $354 a day so October lands on budget (see budget pacing)." },
      ],
    },
  },
  {
    id: "budget",
    ask: "Will we stay on budget in October?",
    answer: {
      headline: "Not at this pace. October is heading $1,264 over its $12,000 budget.",
      observations: [
        { source: "Budget", text: "Spent $5,990 by day 14 of 31. At the current daily rate the month ends at $13,264." },
        { source: "Google Ads", text: "“Implants, Search” is spending $142 a day against $96 a day planned, and accounts for most of the gap." },
        { source: "Analytics", text: "Visits from that campaign convert at 2.4%, below the site average of 3.6%." },
      ],
      explanation:
        "The overspend comes from one campaign that is also converting below average, so trimming it may cost fewer leads than an across-the-board cut.",
      actions: [
        { priority: "First", text: "Lower “Implants, Search” to about $90 a day. That alone brings the forecast down to about $12,380." },
        { priority: "Next", text: "Keep the account at $354 a day for the rest of the month to land on $12,000." },
        { priority: "Then", text: "Let the overspend alert watch it; you'll hear if the pace drifts again." },
      ],
    },
  },
  {
    id: "client",
    ask: "What should we tell the client this week?",
    answer: {
      headline: "A drafted update, ready for you to review and edit before it's sent.",
      observations: [
        { source: "Google Ads", text: "118 new patient leads this month at $50.76 each." },
        { source: "Search Console", text: "Organic clicks down 26% after two rankings slipped on Oct 12." },
        { source: "Budget", text: "On track to land within budget after this week's adjustment." },
      ],
      explanation:
        "Draft: “Leads are steady from ads, and we spotted a dip in Google rankings for two emergency searches. We're covering those searches with ads this week while we fix the page, and we've adjusted spend so October stays on budget.”",
      actions: [
        { priority: "First", text: "Edit the draft in your own words, then send it from Marketing Nexus or copy it to your email." },
        { priority: "Next", text: "Attach the October report as a private link or PDF." },
      ],
    },
  },
];

const SOURCE_CLASS: Record<Source, string> = {
  "Google Ads": "src-ads",
  Analytics: "src-ga",
  "Search Console": "src-sc",
  Rankings: "src-rank",
  Budget: "src-budget",
};

export function AiDemo() {
  const [active, setActive] = useState(QUESTIONS[0].id);
  const q = QUESTIONS.find((x) => x.id === active) ?? QUESTIONS[0];

  return (
    <figure className="mn-demo" aria-label="Example: asking Marketing Nexus about a client. Sample data.">
      <div className="mn-demo-bar">
        <span className="mn-demo-client">
          <span className="mn-demo-avatar" aria-hidden>H</span>
          <span>
            <strong>Harbor Dental</strong>
            <span>Oct 1–26 vs the same days in September</span>
          </span>
        </span>
        <span className="mn-sample">Sample data</span>
      </div>

      <div className="mn-demo-body">
        <div
          className="mn-demo-asks"
          role="tablist"
          aria-label="Example questions"
          aria-orientation="vertical"
          onKeyDown={(e) => {
            const i = QUESTIONS.findIndex((x) => x.id === active);
            const n = QUESTIONS.length;
            const to = { ArrowDown: i + 1, ArrowRight: i + 1, ArrowUp: i - 1, ArrowLeft: i - 1, Home: 0, End: n - 1 }[e.key];
            if (to === undefined) return;
            e.preventDefault();
            const next = QUESTIONS[(to + n) % n];
            setActive(next.id);
            track("demo_question", { question: next.id });
            document.getElementById(`ask-${next.id}`)?.focus();
          }}
        >
          {QUESTIONS.map((x) => (
            <button
              key={x.id}
              type="button"
              role="tab"
              id={`ask-${x.id}`}
              aria-selected={x.id === active}
              tabIndex={x.id === active ? 0 : -1}
              aria-controls="demo-answer"
              className="mn-ask"
              onClick={() => {
                setActive(x.id);
                track("demo_question", { question: x.id });
              }}
            >
              {x.ask}
            </button>
          ))}
        </div>

        <div className="mn-demo-answer" id="demo-answer" role="tabpanel" aria-labelledby={`ask-${q.id}`} aria-live="polite" key={q.id}>
          <p className="mn-answer-headline">{q.answer.headline}</p>

          <section className="mn-answer-part">
            <h3>What the data shows</h3>
            <ul className="mn-obs">
              {q.answer.observations.map((o) => (
                <li key={o.text}>
                  <span className={`mn-src ${SOURCE_CLASS[o.source]}`}>{o.source}</span>
                  <span>{o.text}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="mn-answer-part">
            <h3>What may explain it</h3>
            <p>{q.answer.explanation}</p>
          </section>

          <section className="mn-answer-part">
            <h3>What to do next</h3>
            <ol className="mn-actions-list">
              {q.answer.actions.map((a) => (
                <li key={a.text}>
                  <span className="mn-prio">{a.priority}</span>
                  <span>{a.text}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </figure>
  );
}
