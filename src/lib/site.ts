// Public-facing names for the homepage and legal pages, set per deployment.
export const site = {
  appName: process.env.APP_NAME || "Marketing Nexus",
  company: process.env.PUBLIC_COMPANY_NAME || process.env.APP_NAME || "Marketing Nexus",
  contactEmail: process.env.PUBLIC_CONTACT_EMAIL || null,
  // Date the privacy policy and terms last changed.
  policyDate: "October 17, 2026",
};

/**
 * Absolute link into the app (e.g. /login). The marketing page is also served
 * on the bare domain, where a relative /login would land on the marketing host
 * instead of the app.
 */
export function appLink(path: string): string {
  const base = process.env.APP_URL;
  return base ? new URL(path, base).toString() : path;
}
