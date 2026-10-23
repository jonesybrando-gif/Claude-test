import { describe, expect, it } from "vitest";
import { isSlackWebhookUrl, slackAlertText } from "../slack";

describe("Slack webhooks", () => {
  it("accepts only Slack incoming-webhook URLs", () => {
    expect(isSlackWebhookUrl("https://hooks.slack.com/services/T000/B000/XXXX")).toBe(true);
    expect(isSlackWebhookUrl("http://hooks.slack.com/services/T000/B000/XXXX")).toBe(false);
    expect(isSlackWebhookUrl("https://evil.example.com/services/x")).toBe(false);
    expect(isSlackWebhookUrl("https://hooks.slack.com.evil.example/services/x")).toBe(false);
    expect(isSlackWebhookUrl("not a url")).toBe(false);
  });

  it("formats a batch of alerts with a link and escapes markup", () => {
    const text = slackAlertText("Acme <Agency>", [{ severity: "critical", client: "Board & Brew", title: "Spending stopped · Google Ads", detail: "No spend for 2 days." }], "https://app.example.com/alerts");
    expect(text).toContain("Acme &lt;Agency&gt;: 1 new alert");
    expect(text).toContain("*Board &amp; Brew* · Spending stopped · Google Ads");
    expect(text).toContain("<https://app.example.com/alerts|Open alerts>");
  });
});
