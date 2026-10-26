// The pacing status to show on a badge: the worse of "so far" (status) and
// "by month end" (forecastStatus), so a line that is on plan to date but
// heading well over or under budget is not shown as "On target".

import { STATUS_LABEL, STATUS_SEVERITY, type PacingStatus } from "./status";

export interface PacingStatusLine {
  status: PacingStatus;
  forecastStatus: PacingStatus;
}

export interface DisplayPacingStatus {
  status: PacingStatus;
  label: string;
  /** Set when the badge comes from the forecast rather than spend so far, e.g. "On plan so far; heading over budget by month end (estimate)". */
  forecastNote: string | null;
}

const direction = (s: PacingStatus) => (s === "OVERSPENDING" || s === "SLIGHTLY_OVER" ? "over" : s === "UNDERSPENDING" || s === "SLIGHTLY_UNDER" ? "under" : null);

export function displayPacingStatus(line: PacingStatusLine): DisplayPacingStatus {
  const { status, forecastStatus } = line;
  const fromForecast = STATUS_SEVERITY[forecastStatus] > STATUS_SEVERITY[status];
  const shown = fromForecast ? forecastStatus : status;
  const dir = direction(forecastStatus);
  const forecastNote = fromForecast && dir ? `${status === "ON_TARGET" ? "On plan so far" : `${STATUS_LABEL[status]} so far`}; heading ${dir} budget by month end (estimate)` : null;
  return { status: shown, label: STATUS_LABEL[shown], forecastNote };
}
