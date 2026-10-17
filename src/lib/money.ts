// Money is integer minor units everywhere; only formatting turns it into text.

const formatters = new Map<string, Intl.NumberFormat>();

function formatter(currency: string, whole: boolean): Intl.NumberFormat {
  const key = `${currency}:${whole}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: whole ? 0 : 2,
    });
    formatters.set(key, f);
  }
  return f;
}

/** Assumes 2-decimal currencies (USD, EUR, GBP, CAD, AUD…). */
export function formatMoney(minor: number, currency = "USD", opts: { whole?: boolean } = {}): string {
  return formatter(currency, opts.whole ?? false).format(minor / 100);
}

export function formatPct(pct: number | null, digits = 1): string {
  if (pct === null || !Number.isFinite(pct)) return "—";
  return `${pct.toFixed(digits).replace(/\.0+$/, "")}%`;
}

export function parseMoneyToMinor(input: string): number {
  const cleaned = input.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) throw new Error("Enter an amount like 5000 or 5000.00");
  const [whole, frac = ""] = cleaned.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}

export function formatNumber(n: number, digits = 0): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

const compact = new Map<string, Intl.NumberFormat>();
/** Axis-tick format: $5K, $12.5K, $1.2M */
export function formatMoneyCompact(minor: number, currency = "USD"): string {
  let f = compact.get(currency);
  if (!f) {
    f = new Intl.NumberFormat("en-US", { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 });
    compact.set(currency, f);
  }
  return f.format(minor / 100);
}
