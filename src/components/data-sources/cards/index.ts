// Integrations-page cards for non-ad data sources. Each provider adds ONE import and ONE entry (alphabetical).
import type { ComponentType } from "react";
import { MetaOrganicCard } from "./meta-organic-card";

export const DATA_SOURCE_CARDS: { key: string; Card: ComponentType }[] = [
  { key: "meta-organic", Card: MetaOrganicCard },
];
