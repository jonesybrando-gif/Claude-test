import "server-only";
import type { DataSourceProvider } from "@prisma/client";
import type { DataSourceAdapter } from "./types";
import { callrailAdapter } from "./callrail/adapter";

// Each provider adds ONE import and ONE entry (alphabetical).
const ADAPTERS: Partial<Record<DataSourceProvider, DataSourceAdapter>> = {
  CALLRAIL: callrailAdapter,
};

export function getDataSourceAdapter(provider: DataSourceProvider): DataSourceAdapter | null {
  return ADAPTERS[provider] ?? null;
}
