// PLACEHOLDER – replaced by the gsc work
import type { GoogleKindModule } from "./types";

export const gscModule: GoogleKindModule = {
  kind: "GSC_SITE",
  scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
  listAssets: async () => [],
  fetchMetrics: async () => [],
};
