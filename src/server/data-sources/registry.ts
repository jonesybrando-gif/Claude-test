import "server-only";
import type { DataSourceProvider } from "@prisma/client";
import type { DataSourceAdapter } from "./types";
import { dataForSeoAdapter } from "./dataforseo/adapter";

// Each provider adds ONE import and ONE entry (alphabetical).
const ADAPTERS: Partial<Record<DataSourceProvider, DataSourceAdapter>> = {
  DATAFORSEO: dataForSeoAdapter,
};

export function getDataSourceAdapter(provider: DataSourceProvider): DataSourceAdapter | null {
  return ADAPTERS[provider] ?? null;
}
