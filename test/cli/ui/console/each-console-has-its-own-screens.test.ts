// One bundle, two consoles: the gateway's shows production and runs the org, a machine's own is
// the workshop. Which screens each has is ONE table (lib/mode.ts), and this pins what it says.

import { describe, expect, it } from "vitest";

import { headersFor } from "../../../../src/cli/ui/shared/api.js";
import { AGENT_SCREENS, ORG_SCREENS, WORLD_OF, has, screensOf } from "../../../../src/cli/ui/console/lib/mode.js";

const names = (table: typeof ORG_SCREENS, mode: "local" | "hosted"): string[] => screensOf(table, mode).map((screen) => screen.name);

describe("the gateway's console", () => {
  it("looks at production, and runs the org", () => {
    expect(WORLD_OF.hosted).toBe("production");
    expect(names(ORG_SCREENS, "hosted")).toEqual(["Home", "Overview", "Live", "Sessions", "Usage", "Numbers", "Keys", "Providers", "Team"]);
  });

  it("has no Chat: a written call goes to the class in a developer's own directory", () => {
    expect(has(AGENT_SCREENS, "chat", "hosted")).toBe(false);
    expect(has(AGENT_SCREENS, "talk", "hosted")).toBe(true);
  });
});

describe("a machine's own console", () => {
  it("looks at the sandbox, and has none of the org's accounts", () => {
    expect(WORLD_OF.local).toBe("sandbox");
    expect(names(ORG_SCREENS, "local")).toEqual(["Home", "Overview", "Live", "Sessions", "Phone testing"]);
  });

  it("has every screen of an agent, Chat among them", () => {
    expect(names(AGENT_SCREENS, "local")).toEqual(["Talk", "Chat", "Calls", "Sessions", "Pipeline", "Knowledge", "Memory", "Evals", "Widget"]);
  });

  it("sends no authorization: `pinecall serve` signs what it forwards", () => {
    expect(headersFor({ base: "/", key: "" })).toEqual({});
    expect(headersFor({ base: "/", key: "", corner: "mem_2" })).toEqual({ "pinecall-corner": "mem_2" });
    expect(headersFor({ base: "/", key: "pk_1" })).toEqual({ authorization: "Bearer pk_1" });
  });
});
