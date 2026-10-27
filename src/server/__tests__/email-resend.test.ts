import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const create = vi.fn(async () => ({}));
vi.mock("../db", () => ({ prisma: { emailMessage: { create: (...a: unknown[]) => create(...(a as [])) } } }));

import { resendApiKey, sendEmail } from "../email";

const MSG = { to: "owner@example.com", subject: "New lead", text: "hello", kind: "lead" as const, replyTo: "lead@example.com" };

describe("resendApiKey", () => {
  it("reads RESEND_API_KEY first", () => {
    expect(resendApiKey({ RESEND_API_KEY: "re_a", SMTP_URL: "smtps://resend:re_b@smtp.resend.com:465" })).toBe("re_a");
  });
  it("takes the password from a Resend SMTP_URL", () => {
    expect(resendApiKey({ SMTP_URL: "smtps://resend:re_b@smtp.resend.com:465" })).toBe("re_b");
  });
  it("ignores other SMTP servers and bad URLs", () => {
    expect(resendApiKey({ SMTP_URL: "smtps://u:p@smtp.example.com:465" })).toBeNull();
    expect(resendApiKey({ SMTP_URL: "not a url" })).toBeNull();
    expect(resendApiKey({})).toBeNull();
  });
});

describe("sendEmail through Resend", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    process.env.SMTP_URL = "smtps://resend:re_test@smtp.resend.com:465";
    process.env.EMAIL_FROM = "Marketing Nexus <notifications@mail.example.com>";
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    create.mockClear();
  });
  afterEach(() => {
    delete process.env.SMTP_URL;
    delete process.env.EMAIL_FROM;
    vi.unstubAllGlobals();
  });

  it("posts to the Resend API over HTTPS and records it as sent", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: "abc" }), { status: 200 }));
    const r = await sendEmail(MSG);
    expect(r.status).toBe("SENT");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.Authorization).toBe("Bearer re_test");
    expect(JSON.parse(init.body)).toMatchObject({ from: process.env.EMAIL_FROM, to: ["owner@example.com"], subject: "New lead", reply_to: "lead@example.com" });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "SENT" }) }));
  });

  it("records Resend's error message when it rejects", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ message: "The domain is not verified" }), { status: 403 }));
    const r = await sendEmail(MSG);
    expect(r).toEqual({ status: "FAILED", error: "Resend 403: The domain is not verified" });
  });

  it("records a network failure instead of throwing", async () => {
    fetchMock.mockRejectedValue(new Error("timeout"));
    expect(await sendEmail(MSG)).toEqual({ status: "FAILED", error: "timeout" });
  });
});
