import { beforeEach, describe, expect, it, vi } from "vitest";

const sendEmail = vi.fn();
const findFirst = vi.fn();
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "203.0.113.7" }) }));
vi.mock("@/server/email", () => ({ sendEmail: (...a: unknown[]) => sendEmail(...a) }));
vi.mock("@/server/db", () => ({ prisma: { agency: { findFirst: (...a: unknown[]) => findFirst(...a) } } }));

const { requestEarlyAccess } = await import("../actions");

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

describe("early access form", () => {
  beforeEach(() => {
    sendEmail.mockReset().mockResolvedValue({ status: "NOT_CONFIGURED" });
    findFirst.mockReset().mockResolvedValue({ id: "agency_1" });
  });

  it("records a valid email with where it came from, filed under the owner agency", async () => {
    const res = await requestEarlyAccess(undefined, fd({ email: " dana@northlight.co ", position: "hero", variant: "benefit", utm: "utm_source=google" }));
    expect(res).toEqual({ ok: true });
    expect(sendEmail).toHaveBeenCalledOnce();
    const msg = sendEmail.mock.calls[0][0];
    expect(msg).toMatchObject({ agencyId: "agency_1", replyTo: "dana@northlight.co", kind: "lead", subject: "Early access request: dana@northlight.co" });
    expect(msg.text).toContain("Form: hero (button: benefit)");
    expect(msg.text).toContain("Campaign: utm_source=google");
  });

  it("rejects a missing or invalid email without saving anything", async () => {
    expect(await requestEarlyAccess(undefined, fd({ email: "not-an-email" }))).toEqual({ error: "Enter a work email we can reply to." });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("silently accepts bot submissions that fill the hidden field", async () => {
    expect(await requestEarlyAccess(undefined, fd({ email: "bot@spam.test", website: "http://spam" }))).toEqual({ ok: true });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("returns a clear error instead of a false success when saving fails", async () => {
    sendEmail.mockRejectedValueOnce(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await requestEarlyAccess(undefined, fd({ email: "sam@agency.com" }));
    expect(res?.ok).toBeUndefined();
    expect(res?.error).toContain("Something went wrong saving your request");
  });
});
