# Non-ad data sources and custom dashboards: shared contract

Read this before adding a source. Everything here is shared; keep your source's
code in its own folder and touch shared files only where noted.

## Storage (prisma/schema.prisma, migration 20261023200000_data_sources_dashboards)
- `DataSourceConnection`: agency-level login/credential. `provider`:
  `GOOGLE` (GA4 + Search Console + Business Profile, one OAuth login),
  `META_ORGANIC` (Facebook Pages + Instagram), `CALLRAIL` (API key),
  `DATAFORSEO` (login:password). Tokens and secrets are encrypted via
  `credentials.ts` (`storeDataSourceTokens`, `storeDataSourceSecret`).
- `DataAsset`: one property/site/location/page/company/rank project, linked to
  a client (`kind`).
- `MetricDaily`: daily values. `dimension = ""` holds account totals; breakdowns
  use e.g. `("query", "dentist near me")`. Store totals as their own rows, not
  as sums of breakdown rows (sampling and thresholds make those differ).
- `TrackedKeyword` / `KeywordRank`: exact daily ranks (DataForSEO).
- `Dashboard`: custom dashboards; `widgets` JSON = `DashboardWidget[]`
  (`src/lib/dashboards/types.ts`).

## Adding a source
1. Metrics: `src/lib/metrics-registry/<source>.ts` exports `{ metrics, dimensions }`.
   Keys are `"<source>.<name>"`. Add ONE line to `SOURCES` in
   `src/lib/metrics-registry/index.ts`.
2. Adapter: `src/server/data-sources/<provider>/adapter.ts` implements
   `DataSourceAdapter` (`types.ts`). Add ONE entry to `registry.ts`.
   `fetchMetrics` returns every row for [from, to]; the runner (`sync.ts`)
   replaces stored rows for that window, refreshes OAuth tokens, backfills 13
   months on first sync and re-fetches `refetchDays` each hour.
3. Connect flow: routes under `src/app/api/data-sources/<provider>/…` (OAuth
   start/callback, or a form action for API keys) that create/update a
   `DataSourceConnection`. OAuth state: reuse `src/server/integrations/oauth-state.ts`.
4. Linking assets to clients: a picker page at
   `src/app/(app)/integrations/data-sources/[connectionId]/page.tsx` (built by
   the GOOGLE work; others reuse the same component
   `src/components/data-sources/asset-picker.tsx`).
5. Integrations page: add your card as its own component in
   `src/components/data-sources/cards/<provider>-card.tsx` and ONE line in
   `src/components/data-sources/cards/index.ts`.
6. Reading data: only via `src/server/metrics/query.ts`
   (`metricTotals`, `metricSeries`, `metricBreakdown`).

## Rules
- Official APIs only. Never log tokens or secrets.
- Server-side permission checks on every action (`src/server/access.ts`).
- No route-level `loading.tsx` (it makes server actions hang here).
- Don't change ad sync (`src/server/sync/**`, `src/server/integrations/**`).
