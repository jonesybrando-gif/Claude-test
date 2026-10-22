/** The agency's logo to show: an uploaded image wins over a pasted URL. */
export const agencyLogo = (a: { logoData?: string | null; logoUrl?: string | null }) => a.logoData || a.logoUrl || null;

export const LOGO_MAX_BYTES = 300_000;
export const LOGO_TYPES = ["image/png", "image/jpeg"];
