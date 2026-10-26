"use client";

// Conversion events for the marketing page. Pushed to the Google Tag Manager
// dataLayer when GTM is loaded (NEXT_PUBLIC_GTM_ID); a no-op otherwise.
//
// Events: cta_primary_click {position}, cta_demo_click, demo_question {question},
// tour_step {step}, signup_start {position}, signup_complete {position}.

type DataLayerWindow = Window & { dataLayer?: Record<string, unknown>[] };

export function track(event: string, params: Record<string, string | number> = {}) {
  if (typeof window === "undefined") return;
  const w = window as DataLayerWindow;
  if (!Array.isArray(w.dataLayer)) return;
  w.dataLayer.push({ event, ...params });
}
