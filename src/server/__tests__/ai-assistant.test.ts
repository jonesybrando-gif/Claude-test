// The assistant against a fake Anthropic API: checks the request we send and
// how responses, refusals and errors are handled. No network, no API key.
import { afterEach, describe, expect, it } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { AiError, draftClientEmail, draftReportSummary, generateSuggestions, setAiClientForTests } from "../ai/assistant";

type Body = Record<string, unknown> & { messages: { content: string }[] };

function fakeApi(reply: (body: Body) => { status?: number; json: unknown }) {
  const calls: { body: Body; headers: Headers }[] = [];
  const client = new Anthropic({
    apiKey: "test-key",
    maxRetries: 0,
    fetch: async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as Body;
      calls.push({ body, headers: new Headers(init?.headers) });
      const r = reply(body);
      return new Response(JSON.stringify(r.json), { status: r.status ?? 200, headers: { "content-type": "application/json" } });
    },
  });
  setAiClientForTests(client);
  return calls;
}

const message = (text: string, stop_reason = "end_turn") => ({
  id: "msg_1", type: "message", role: "assistant", model: "claude-opus-5-5", stop_reason, stop_sequence: null,
  content: text ? [{ type: "text", text }] : [], usage: { input_tokens: 10, output_tokens: 10 },
});

afterEach(() => setAiClientForTests(null));

describe("AI assistant", () => {
  it("sends grounded data with structured output and a refusal fallback", async () => {
    const calls = fakeApi(() => ({ json: message(JSON.stringify({ suggestions: [{ title: "Cut daily spend", priority: "high", category: "budget", detail: "d", evidence: "Pacing 125%" }] })) }));
    const out = await generateSuggestions("Client: ABC\nPacing 125%");
    expect(out.suggestions[0]).toMatchObject({ title: "Cut daily spend", priority: "high" });
    const { body, headers } = calls[0];
    expect(body.model).toBe("claude-opus-5-5");
    expect(body.fallbacks).toBe("default");
    expect(headers.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
    expect((body.output_config as { format: { type: string } }).format.type).toBe("json_schema");
    expect(body.messages[0].content).toContain("<DATA>\nClient: ABC\nPacing 125%\n</DATA>");
    expect(String(body.system)).toContain("Never invent numbers");
    expect(body).not.toHaveProperty("thinking");
  });

  it("caps suggestions at six", async () => {
    const s = { title: "t", priority: "low", category: "data", detail: "d", evidence: "e" };
    fakeApi(() => ({ json: message(JSON.stringify({ suggestions: Array(9).fill(s) })) }));
    expect((await generateSuggestions("x")).suggestions).toHaveLength(6);
  });

  it("drafts a summary and an email with the sender's notes", async () => {
    const calls = fakeApi((b) => ({ json: message(JSON.stringify(String(b.messages[0].content).includes("Draft an email") ? { subject: " Your September results ", body: "Hi Dana,\n\nBest,\nAlex" } : { summary: "  Leads rose.  " })) }));
    expect(await draftReportSummary("x", { agencyName: "Northstar" })).toBe("Leads rose.");
    const email = await draftClientEmail("x", { purpose: "monthly_update", notes: "New landing page live on the 12th", senderName: "Alex", agencyName: "Northstar", recipientName: "Dana" });
    expect(email.subject).toBe("Your September results");
    expect(calls[1].body.messages[0].content).toContain("<NOTES>\nNew landing page live on the 12th\n</NOTES>");
    expect(calls[1].body.messages[0].content).toContain("sign off as Alex");
  });

  it("turns refusals, truncation and API errors into readable messages", async () => {
    fakeApi(() => ({ json: message("", "refusal") }));
    await expect(generateSuggestions("x")).rejects.toThrow(/declined/);
    fakeApi(() => ({ json: message('{"summ', "max_tokens") }));
    await expect(draftReportSummary("x", { agencyName: "A" })).rejects.toThrow(/cut off or couldn't be read/);
    fakeApi(() => ({ status: 401, json: { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } } }));
    await expect(generateSuggestions("x")).rejects.toThrow(/API key was rejected/);
    fakeApi(() => ({ status: 429, json: { type: "error", error: { type: "rate_limit_error", message: "slow down" } } }));
    const err = await generateSuggestions("x").catch((e) => e);
    expect(err).toBeInstanceOf(AiError);
    expect(err.message).toMatch(/busy/);
  });
});
