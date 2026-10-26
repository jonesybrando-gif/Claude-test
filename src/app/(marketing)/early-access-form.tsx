"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormSubmit } from "@/components/use-form-submit";
import { requestEarlyAccess } from "./actions";
import { CTA_COOKIE, CTA_LABELS, NEXT_STEP, REASSURANCE, type CtaVariant } from "./signup-copy";
import { track } from "./track";

/**
 * The page's one signup form: an email field and a button. Every placement
 * (hero, middle, final) uses this component, so the process and wording match.
 * `position` names the placement for tracking; `variant` is the CTA label under test.
 */
export function EarlyAccessForm({ position, variant, tone = "light" }: { position: string; variant: CtaVariant; tone?: "light" | "dark" }) {
  const [state, action, pending] = useActionState(requestEarlyAccess, undefined);
  const form = useFormSubmit(action, state?.ok);
  const started = useRef(false);
  const doneRef = useRef<HTMLDivElement>(null);
  const [email, setEmail] = useState("");
  const id = `ea-${position}`;
  // Campaign parameters from the landing URL, read after hydration so server and client markup match.
  const [utm, setUtm] = useState("");
  useEffect(() => setUtm(new URLSearchParams(window.location.search).toString().slice(0, 500)), []);

  // Keep the visitor on the variant they first saw (the server picks one when the cookie is missing).
  useEffect(() => {
    if (!document.cookie.split("; ").some((c) => c.startsWith(`${CTA_COOKIE}=`))) {
      document.cookie = `${CTA_COOKIE}=${variant}; path=/; max-age=${60 * 60 * 24 * 90}; samesite=lax`;
    }
  }, [variant]);

  useEffect(() => {
    if (!state?.ok) return;
    track("signup_complete", { position, cta_variant: variant });
    doneRef.current?.focus();
  }, [state?.ok, position, variant]);

  if (state?.ok) {
    return (
      <div className={`mn-done mn-done-${tone}`} role="status" tabIndex={-1} ref={doneRef}>
        <p className="mn-done-title">Thanks, you&apos;re on the list.</p>
        <p>
          We&apos;ll email {email ? <strong>{email}</strong> : "you"} an invitation to book a setup call. On the call we connect your first client together, so you start with
          your own data, not an empty dashboard.
        </p>
      </div>
    );
  }

  return (
    <div className={`mn-signup mn-signup-${tone}`}>
      <form
        ref={form.ref}
        onSubmit={(e) => {
          setEmail(String(new FormData(e.currentTarget).get("email") ?? "").trim());
          track("cta_primary_click", { position, cta_variant: variant });
          form.onSubmit(e);
        }}
        className="mn-inline-form"
        aria-describedby={`${id}-help`}
      >
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
          aria-invalid={state?.error ? true : undefined}
          aria-describedby={state?.error ? `${id}-error` : undefined}
          onFocus={() => {
            if (!started.current) track("signup_start", { position, cta_variant: variant });
            started.current = true;
          }}
        />
        <input type="hidden" name="position" value={position} />
        <input type="hidden" name="variant" value={variant} />
        <input type="hidden" name="utm" value={utm} />
        <div aria-hidden className="mn-hp">
          <label htmlFor={`${id}-website`}>Website</label>
          <input id={`${id}-website`} name="website" tabIndex={-1} autoComplete="off" />
        </div>
        <button type="submit" className="mn-btn mn-btn-primary" disabled={pending}>
          {pending ? "Sending…" : CTA_LABELS[variant]}
        </button>
      </form>
      {state?.error && (
        <p className="mn-form-error" role="alert" id={`${id}-error`}>
          {state.error}
        </p>
      )}
      <div className="mn-form-help" id={`${id}-help`}>
        <p className="mn-reassure">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="4" y="11" width="16" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
          {REASSURANCE}
        </p>
        <p>{NEXT_STEP}</p>
      </div>
    </div>
  );
}
