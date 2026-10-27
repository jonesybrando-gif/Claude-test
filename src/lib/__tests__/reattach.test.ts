import { describe, expect, it } from "vitest";
import { pickReattachments } from "../reattach";

const orphan = (id: string, externalId: string, extra: Partial<{ connectionId: string; status: string }> = {}) => ({
  id, clientId: "c1", platform: "GOOGLE_ADS", externalId, connectionId: "old", status: "NEEDS_REAUTH", ...extra,
});

describe("pickReattachments", () => {
  it("moves orphans the new connection can reach, with its manager id", () => {
    const moves = pickReattachments([orphan("a", "111"), orphan("b", "222")], [{ externalId: "111", isManager: false, loginCustomerId: "999" }], "new");
    expect(moves).toEqual([{ accountId: "a", loginCustomerId: "999" }]);
  });
  it("ignores manager accounts and accounts already live on this connection", () => {
    const moves = pickReattachments(
      [orphan("a", "111"), orphan("b", "222", { connectionId: "new", status: "ACTIVE" })],
      [{ externalId: "111", isManager: true }, { externalId: "222", isManager: false }],
      "new",
    );
    expect(moves).toEqual([]);
  });
});
