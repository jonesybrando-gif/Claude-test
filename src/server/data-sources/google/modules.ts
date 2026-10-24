import type { GoogleKindModule } from "./types";
import { ga4Module } from "./ga4";
import { gbpModule } from "./gbp";
import { gscModule } from "./gsc";

/** Every Google product behind the single GOOGLE data-source login. */
export const GOOGLE_MODULES: GoogleKindModule[] = [ga4Module, gscModule, gbpModule];

export const GOOGLE_BASE_SCOPES = ["openid", "email"];

/** openid + email + every module's scopes, de-duplicated, in a stable order. */
export function googleScopes(modules: GoogleKindModule[] = GOOGLE_MODULES): string[] {
  return [...new Set([...GOOGLE_BASE_SCOPES, ...modules.flatMap((m) => m.scopes)])];
}
