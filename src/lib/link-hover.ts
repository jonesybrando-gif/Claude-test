/**
 * Spread onto a <Link>: load the full page while the pointer rests on it, so
 * the click shows it at once. (Supported by the App Router's Link; its public
 * types don't list it yet.)
 */
export const loadOnHover = { unstable_dynamicOnHover: true } as Record<string, unknown>;
