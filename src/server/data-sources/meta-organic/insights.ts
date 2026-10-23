import "server-only";
import { GraphError, type GraphClient, type InsightSeries } from "./graph";

/** One stored metric and the Graph insights metric names that can feed it, best first. */
export interface InsightSpec {
  /** Metric registry key, e.g. "facebook.reach". */
  key: string;
  /** Graph metric names to try in order (newer replacement first, deprecated name as fallback). */
  candidates: string[];
}

export interface InsightResult {
  /** Registry key → series returned for the first candidate that Graph accepted. */
  series: Map<string, InsightSeries>;
  /** Registry keys none of whose candidates Graph accepted (deprecated / unsupported). */
  skipped: string[];
}

/**
 * Request several insights metrics at once. Graph rejects the whole request
 * when any one metric is unknown (#100), so on that error fall back to one
 * request per metric, trying each candidate name in turn. Auth and other
 * errors propagate.
 */
export async function fetchInsights(client: GraphClient, path: string, token: string, specs: InsightSpec[], params: Record<string, string>): Promise<InsightResult> {
  const series = new Map<string, InsightSeries>();
  const skipped: string[] = [];
  if (!specs.length) return { series, skipped };

  const pick = (data: InsightSeries[] | undefined, spec: InsightSpec, name: string) => {
    const s = data?.find((d) => d.name === name);
    if (s) series.set(spec.key, s);
    return !!s;
  };

  try {
    const res = await client.get<{ data?: InsightSeries[] }>(path, token, { ...params, metric: specs.map((s) => s.candidates[0]).join(",") });
    const missing = specs.filter((s) => !pick(res.data, s, s.candidates[0]));
    // A metric Graph silently left out: try its fallbacks on their own.
    for (const spec of missing) if (!(await perMetric(spec, 1))) skipped.push(spec.key);
    return { series, skipped };
  } catch (e) {
    if (!(e instanceof GraphError) || e.kind !== "INVALID_METRIC") throw e;
  }
  for (const spec of specs) if (!(await perMetric(spec, 0))) skipped.push(spec.key);
  return { series, skipped };

  async function perMetric(spec: InsightSpec, start: number): Promise<boolean> {
    for (const name of spec.candidates.slice(start)) {
      try {
        const res = await client.get<{ data?: InsightSeries[] }>(path, token, { ...params, metric: name });
        if (pick(res.data, spec, name)) return true;
      } catch (e) {
        if (!(e instanceof GraphError) || e.kind !== "INVALID_METRIC") throw e;
      }
    }
    return false;
  }
}
