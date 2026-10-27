import type { GoogleKindModule } from "./types";
import { ga4Module } from "./ga4";
import { gbpModule } from "./gbp";
import { gscModule } from "./gsc";

/**
 * Business Profile joins once the Cloud project has Business Profile API access and
 * business.manage is on the verified consent screen (set GOOGLE_GBP_ENABLED=1).
 * Until then the login asks only for Analytics and Search Console.
 */
export const GBP_ENABLED = process.env.GOOGLE_GBP_ENABLED === "1";

/** Every Google product behind the single GOOGLE data-source login. */
export const GOOGLE_MODULES: GoogleKindModule[] = GBP_ENABLED ? [ga4Module, gscModule, gbpModule] : [ga4Module, gscModule];

export const GOOGLE_BASE_SCOPES = ["openid", "email"];

/** openid + email + every module's scopes, de-duplicated, in a stable order. */
export function googleScopes(modules: GoogleKindModule[] = GOOGLE_MODULES): string[] {
  return [...new Set([...GOOGLE_BASE_SCOPES, ...modules.flatMap((m) => m.scopes)])];
}
