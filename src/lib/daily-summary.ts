import type { AlertLine } from "./email-templates";
import type { Action } from "./action-center";
import { displayPacingStatus } from "./pacing/display-status";
import type { PacingStatus } from "./pacing/status";

export interface SummaryRow {
  clientId: string;
  clientName: string;
  stale: boolean;
  disconnected: boolean;
  lastSuccessfulSyncAt: string | null;
  result: { status: PacingStatus; forecastStatus: PacingStatus } | null;
  action: Action;
}

const STALE_SUFFIX = " Data is stale — confirm in the ad platform before acting.";

/**
 * Splits budget lines for the weekday summary email. Lines that are on target
 * but whose data is stale don't "need action": they are listed separately with
 * "Data is X hours old — confirm before acting" (L5). Pacing types muted for a
 * client (Client.mutedAlertTypes) are left out.
 */
export function summaryLines(rows: SummaryRow[], muted: Map<string, string[]>, now: Date): { needAction: AlertLine[]; onTarget: number; staleOnTarget: AlertLine[] } {
  const hoursOld = (r: SummaryRow) => (r.lastSuccessfulSyncAt ? Math.round((now.getTime() - new Date(r.lastSuccessfulSyncAt).getTime()) / 3_600_000) : null);
  const ageNote = (r: SummaryRow) => {
    const h = hoursOld(r);
    return h === null ? "Data has never synced — confirm before acting." : `Data is ${h} hours old — confirm before acting.`;
  };
  const critical: AlertLine[] = [];
  const warning: AlertLine[] = [];
  const staleOnTarget: AlertLine[] = [];
  let onTarget = 0;
  for (const r of rows) {
    const shown = r.result ? displayPacingStatus(r.result).status : null;
    if (r.stale && !r.disconnected && shown === "ON_TARGET") {
      staleOnTarget.push({ severity: "info", client: r.clientName, title: "On target, but data is old", detail: ageNote(r) });
      continue;
    }
    if (r.action.severity === "ok") {
      onTarget++;
      continue;
    }
    if (r.action.severity !== "critical" && r.action.severity !== "warning") continue;
    const m = muted.get(r.clientId) ?? [];
    if ((shown === "OVERSPENDING" || shown === "SLIGHTLY_OVER") && m.includes("OVERSPENDING")) continue;
    if ((shown === "UNDERSPENDING" || shown === "SLIGHTLY_UNDER") && m.includes("UNDERSPENDING")) continue;
    const line: AlertLine = {
      severity: r.action.severity,
      client: r.clientName,
      title: r.action.headline,
      detail: r.stale && !r.disconnected ? `${r.action.detail.replace(STALE_SUFFIX, "")} ${ageNote(r)}` : r.action.detail,
    };
    (r.action.severity === "critical" ? critical : warning).push(line);
  }
  return { needAction: [...critical, ...warning], onTarget, staleOnTarget };
}
