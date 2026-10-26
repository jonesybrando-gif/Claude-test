import { STATUS_LABEL, type PacingStatus } from "./status";

/** How far a status is from target, ignoring direction. NOT_STARTED / NO_BUDGET carry no pacing signal. */
const DISTANCE: Record<PacingStatus, number> = {
  OVERSPENDING: 2,
  UNDERSPENDING: 2,
  SLIGHTLY_OVER: 1,
  SLIGHTLY_UNDER: 1,
  ON_TARGET: 0,
  NOT_STARTED: -1,
  NO_BUDGET: -1,
};

const FORECAST_WORDS: Partial<Record<PacingStatus, string>> = {
  OVERSPENDING: "well over budget",
  SLIGHTLY_OVER: "a little over budget",
  UNDERSPENDING: "well under budget",
  SLIGHTLY_UNDER: "a little under budget",
};

export interface DisplayPacingStatus {
  /** The worse of pacing to date and the month-end forecast. */
  status: PacingStatus;
  label: string;
  /** Plain sentence when the forecast, not spend to date, decides the status; otherwise null. */
  forecastNote: string | null;
}

/**
 * The status to show for a budget line: whichever of "spend so far" and
 * "month-end forecast" is further from target. A line that is on plan so far
 * but will finish well short is shown as underspending, with a note saying so.
 * Ties keep the to-date status.
 */
export function displayPacingStatus(line: { status: PacingStatus; forecastStatus: PacingStatus }): DisplayPacingStatus {
  const { status, forecastStatus } = line;
  if (DISTANCE[forecastStatus] > DISTANCE[status] && DISTANCE[status] >= 0) {
    const sofar = status === "ON_TARGET" ? "On plan so far" : `${STATUS_LABEL[status]} so far`;
    return {
      status: forecastStatus,
      label: STATUS_LABEL[forecastStatus],
      forecastNote: `${sofar}, but forecast to finish ${FORECAST_WORDS[forecastStatus] ?? STATUS_LABEL[forecastStatus].toLowerCase()}.`,
    };
  }
  return { status, label: STATUS_LABEL[status], forecastNote: null };
}
