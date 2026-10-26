"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormSubmit } from "@/components/use-form-submit";
import { requestEarlyAccess } from "./actions";
import { track } from "./track";

/** One field and one button. `position` names where on the page the form sits, for tracking. */
export function EarlyAccessForm({ position, tone = "light", note }: { position: string; tone?: "light" | "dark"; note?: string }) {
  const [state, action, pending] = useActionState(requestEarlyAccess, undefined);
  const form = useFormSubmit(action, state?.ok);
  const started = useRef(false);
  const id = `ea-${position}`;
  // Campaign parameters from the landing URL, read after hydration so server and client markup match.
  const [utm, setUtm] = useState("");
  useEffect(() => setUtm(new URLSearchParams(window.location.search).toString().slice(0, 500)), []);

  useEffect(() => {
    if (state?.ok) track("signup_complete", { position });
  }, [state?.ok, position]);

  if (state?.ok) {
    return (
      <div className={`mn-done mn-done-${tone}`} role="status">
        <p className="mn-done-title">You&apos;re on the list.</p>
        <p>We&apos;ll email you to book a short setup call. On the call we connect your first client&apos;s accounts together, so you leave with real answers, not an empty dashboard.</p>
      </div>
    );
  }


  return (
    <div className={`mn-signup mn-signup-${tone}`}>
      <form {...form} className="mn-inline-form">
        <label htmlFor={id} className="mn-sr">Work email</label>
        <input
          id={id}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@agency.com"
          required
          maxLength={200}
          onFocus={() => {
            if (!started.current) track("signup_start", { position });
            started.current = true;
          }}
        />
        <input type="hidden" name="position" value={position} />
        <input type="hidden" name="utm" value={utm} />
        <div aria-hidden className="mn-hp">
          <label htmlFor={`${id}-website`}>Website</label>
          <input id={`${id}-website`} name="website" tabIndex={-1} autoComplete="off" />
        </div>
        <button type="submit" className="mn-btn mn-btn-primary" disabled={pending} onClick={() => track("cta_primary_click", { position })}>
          {pending ? "Sending…" : "Get early access"}
        </button>
      </form>
      {state?.error ? <p className="mn-form-error" role="alert">{state.error}</p> : note ? <p className="mn-form-note">{note}</p> : null}
    </div>
  );
}
