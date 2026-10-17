// Public-facing names for the homepage and legal pages, set per deployment.
export const site = {
  appName: process.env.APP_NAME || "Budget Pacing Monitor",
  company: process.env.PUBLIC_COMPANY_NAME || process.env.APP_NAME || "Budget Pacing Monitor",
  contactEmail: process.env.PUBLIC_CONTACT_EMAIL || null,
  // Date the privacy policy and terms last changed.
  policyDate: "October 17, 2026",
};
