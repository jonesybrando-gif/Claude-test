"use client";

import { useActionState } from "react";
import { useFormSubmit } from "@/components/use-form-submit";
import { requestEarlyAccess } from "./actions";

export function EarlyAccessForm() {
  const [state, action, pending] = useActionState(requestEarlyAccess, undefined);
  const form = useFormSubmit(action, state?.ok);

  if (state?.ok) {
    return (
      <div className="mn-form-done" role="status">
        <p className="mn-form-done-title">Request received.</p>
        <p>We&apos;ll reply by email to set up your agency and connect your first ad accounts.</p>
      </div>
    );
  }

  return (
    <form {...form} className="mn-form" noValidate={false}>
      <div className="mn-field">
        <label htmlFor="ea-name">Your name</label>
        <input id="ea-name" name="name" autoComplete="name" required maxLength={120} />
      </div>
      <div className="mn-field">
        <label htmlFor="ea-email">Work email</label>
        <input id="ea-email" name="email" type="email" autoComplete="email" required maxLength={200} />
      </div>
      <div className="mn-field">
        <label htmlFor="ea-agency">Agency or company</label>
        <input id="ea-agency" name="agency" autoComplete="organization" required maxLength={160} />
      </div>
      <fieldset className="mn-field mn-choices">
        <legend>Client ad accounts you manage</legend>
        <div>
          {["1-10", "11-30", "31-100", "100+"].map((v, i) => (
            <label key={v} className="mn-choice">
              <input type="radio" name="accounts" value={v} required defaultChecked={i === 1} />
              <span>{v.replace("-", "–")}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="mn-field mn-field-wide">
        <label htmlFor="ea-note">What do you report on today? <span className="mn-optional">Optional</span></label>
        <textarea id="ea-note" name="note" rows={3} maxLength={1000} placeholder="e.g. Google Ads and Meta for 20 home-service clients, monthly reports in Looker Studio" />
      </div>
      {/* Honeypot, hidden from people and screen readers. */}
      <div aria-hidden className="mn-hp">
        <label htmlFor="ea-website">Website</label>
        <input id="ea-website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      {state?.error && <p className="mn-form-error" role="alert">{state.error}</p>}
      <button type="submit" className="mn-btn mn-btn-primary mn-field-wide" disabled={pending}>
        {pending ? "Sending request…" : "Request early access"}
      </button>
    </form>
  );
}
