import { describe, expect, it } from "vitest";
import { describeSchedule, nextRunAt, parseRecipients, zonedTime } from "../report-schedule";

describe("zonedTime", () => {
  it("converts a local wall-clock time to UTC, across DST", () => {
    expect(zonedTime("2026-07-01", 8, "America/New_York").toISOString()).toBe("2026-07-01T12:00:00.000Z");
    expect(zonedTime("2026-12-01", 8, "America/New_York").toISOString()).toBe("2026-12-01T13:00:00.000Z");
    expect(zonedTime("2026-12-01", 8, "UTC").toISOString()).toBe("2026-12-01T08:00:00.000Z");
  });
});

describe("nextRunAt", () => {
  const monthly = { frequency: "monthly" as const, dayOfMonth: 3, dayOfWeek: null };
  const weekly = { frequency: "weekly" as const, dayOfMonth: null, dayOfWeek: 1 };

  it("finds the next monthly date at 8:00 local", () => {
    expect(nextRunAt(monthly, "America/New_York", new Date("2026-10-23T15:00:00Z")).toISOString()).toBe("2026-11-03T13:00:00.000Z");
    expect(nextRunAt(monthly, "America/New_York", new Date("2026-11-03T12:59:00Z")).toISOString()).toBe("2026-11-03T13:00:00.000Z");
    expect(nextRunAt(monthly, "America/New_York", new Date("2026-11-03T13:00:00Z")).toISOString()).toBe("2026-12-03T13:00:00.000Z");
  });

  it("finds the next weekday", () => {
    // 2026-10-23 is a Friday; the next Monday is the 26th.
    expect(nextRunAt(weekly, "UTC", new Date("2026-10-23T09:00:00Z")).toISOString()).toBe("2026-10-26T08:00:00.000Z");
  });

  it("describes the rule", () => {
    expect(describeSchedule(monthly)).toBe("Monthly on the 3rd at 8:00");
    expect(describeSchedule(weekly)).toBe("Every Monday at 8:00");
  });
});

describe("parseRecipients", () => {
  it("splits, lowercases, dedupes and flags bad addresses", () => {
    expect(parseRecipients("Dana@Client.com, ops@client.com;dana@client.com\nnot-an-email")).toEqual({ emails: ["dana@client.com", "ops@client.com"], invalid: ["not-an-email"] });
  });
});
