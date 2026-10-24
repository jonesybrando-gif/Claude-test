// Integrations-page cards for non-ad data sources. Each provider adds ONE import and ONE entry (alphabetical).
import type { ComponentType } from "react";
import { CallRailCard } from "./callrail-card";
import { DataForSeoCard } from "./dataforseo-card";
import { GoogleDataSourceCard } from "./google-card";
import { MetaOrganicCard } from "./meta-organic-card";

export const DATA_SOURCE_CARDS: { key: string; Card: ComponentType }[] = [
  { key: "callrail", Card: CallRailCard },
  { key: "dataforseo", Card: DataForSeoCard },
  { key: "google", Card: GoogleDataSourceCard },
  { key: "meta-organic", Card: MetaOrganicCard },
];
