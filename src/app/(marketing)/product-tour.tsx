"use client";

import { useState } from "react";
import { track } from "./track";

// A click-through of the real workflow, from connecting accounts to acting on
// what Marketing Nexus finds. Each step pairs one sentence with a product view.
// Sample data throughout.

const STEPS = [
  { id: "connect", title: "Connect your sources", body: "Sign in with Google and Meta, add CallRail and rank tracking, then assign each account to a client. Marketing Nexus only reads data." },
  { id: "see", title: "See every channel in one place", body: "Paid results, website visits and goals, organic search and rankings for each client, refreshed every hour." },
  { id: "understand", title: "Understand what changed", body: "AI connects the channels and separates what the data shows from what may explain it." },
  { id: "act", title: "Act and report", body: "Work through the next steps, keep budgets on pace, and send the client a branded report." },
] as const;

type StepId = (typeof STEPS)[number]["id"];

function Panel({ step }: { step: StepId }) {
  if (step === "connect")
    return (
      <ul className="mn-tour-list">
        {[
          ["Google Ads", "3 accounts"],
          ["Google Analytics 4", "Harbor Dental website"],
          ["Search Console", "harbordental.com"],
          ["Keyword rankings", "24 keywords"],
          ["Meta Ads", "1 account"],
          ["CallRail", "2 tracking numbers"],
        ].map(([name, detail]) => (
          <li key={name}>
            <span className="mn-dot mn-dot-good" aria-hidden />
            <strong>{name}</strong>
            <span>{detail}</span>
            <em>Connected</em>
          </li>
        ))}
      </ul>
    );
  if (step === "see")
    return (
      <div className="mn-tour-grid">
        {[
          ["Paid leads", "118", "-10%", "down"],
          ["Website goals", "152", "-19%", "down"],
          ["Organic clicks", "1,702", "-26%", "down"],
          ["Keywords in top 10", "11 of 24", "-3", "down"],
          ["Cost per lead", "$50.76", "+15%", "down"],
          ["Budget forecast", "$13,264", "of $12,000", "warn"],
        ].map(([label, value, change, tone]) => (
          <div key={label} className="mn-tile">
            <span>{label}</span>
            <strong>{value}</strong>
            <em className={`tone-${tone}`}>{change}</em>
          </div>
        ))}
      </div>
    );
  if (step === "understand")
    return (
      <div className="mn-tour-insight">
        <div className="mn-insight">
          <span className="mn-insight-kind">What the data shows</span>
          <strong>Organic clicks fell 26% after two rankings slipped on Oct 12</strong>
          <p>Search Console and the rank tracker agree; impressions held steady.</p>
        </div>
        <div className="mn-insight">
          <span className="mn-insight-kind">What may explain it</span>
          <strong>Lower positions, not lower demand</strong>
          <p>People still see the site in search but click it less often from position 6 than from position 2.</p>
        </div>
        <div className="mn-insight mn-insight-action">
          <span className="mn-insight-kind">What to do next</span>
          <strong>Cover &ldquo;emergency dentist&rdquo; with paid search while organic recovers</strong>
          <p>It&apos;s already the best paid converter at $41 per lead.</p>
        </div>
      </div>
    );
  return (
    <div className="mn-tour-act">
      <div className="mn-tile mn-tile-wide">
        <span>October pacing</span>
        <strong>Spend $354 a day to land on budget</strong>
        <div className="mn-bar" aria-hidden>
          <i style={{ width: "50%" }} />
          <b style={{ left: "45%" }} />
        </div>
      </div>
      <div className="mn-tile mn-tile-wide">
        <span>Client report</span>
        <strong>October report for Harbor Dental</strong>
        <p>Your logo and colors, a plain-English summary and &ldquo;What we&apos;re doing next&rdquo;. Sent weekly or monthly by private link or PDF.</p>
      </div>
    </div>
  );
}

export function ProductTour() {
  const [step, setStep] = useState<StepId>("connect");
  const idx = STEPS.findIndex((s) => s.id === step);

  return (
    <div className="mn-tour">
      <ol className="mn-tour-steps" role="tablist" aria-label="Product tour">
        {STEPS.map((s, i) => (
          <li key={s.id}>
            <button
              type="button"
              role="tab"
              id={`tour-${s.id}`}
              aria-selected={s.id === step}
              aria-controls="tour-panel"
              onClick={() => {
                setStep(s.id);
                track("tour_step", { step: i + 1 });
              }}
            >
              <span className="mn-step-n">{i + 1}</span>
              <span>
                <strong>{s.title}</strong>
                <span>{s.body}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>
      <div className="mn-tour-panel" id="tour-panel" role="tabpanel" aria-labelledby={`tour-${step}`}>
        <div className="mn-tour-panel-head">
          <span>Harbor Dental</span>
          <span className="mn-sample">Sample data</span>
        </div>
        <Panel step={step} />
        <div className="mn-tour-nav">
          <button type="button" className="mn-btn mn-btn-quiet mn-btn-sm" disabled={idx === 0} onClick={() => setStep(STEPS[Math.max(idx - 1, 0)].id)}>
            Back
          </button>
          <button
            type="button"
            className="mn-btn mn-btn-quiet mn-btn-sm"
            disabled={idx === STEPS.length - 1}
            onClick={() => {
              const next = STEPS[Math.min(idx + 1, STEPS.length - 1)];
              setStep(next.id);
              track("tour_step", { step: idx + 2 });
            }}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
