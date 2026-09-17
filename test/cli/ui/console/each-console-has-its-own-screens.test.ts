// One bundle, two consoles: the gateway's shows production and runs the org, a machine's own is
// the workshop. Which screens each has is ONE table (lib/mode.ts), and this pins what it says.

import { describe, expect, it } from "vitest";

import { headersFor } from "../../../../src/cli/ui/shared/api.js";
import { AGENT_SCREENS, BOX_SCREENS, ORG_SCREENS, WORLD_OF, has, screensOf } from "../../../../src/cli/ui/console/lib/mode.js";

const names = (table: typeof ORG_SCREENS, mode: "local" | "hosted"): string[] => screensOf(table, mode).map((screen) => screen.name);

describe("the gateway's console", () => {
  it("looks at production, and runs the org", () => {
    expect(WORLD_OF.hosted).toBe("production");
    expect(names(ORG_SCREENS, "hosted")).toEqual(["Home", "Overview", "Live", "Sessions", "Evals", "Usage", "Numbers", "Keys", "Providers", "Team"]);
  });

  it("talks and chats with what is deployed, and has no Dev chat: that one mounts the class in a developer's own directory", () => {
    expect(has(AGENT_SCREENS, "talk", "hosted")).toBe(true);
    expect(has(AGENT_SCREENS, "chat", "hosted")).toBe(true);
    expect(has(AGENT_SCREENS, "devchat", "hosted")).toBe(false);
  });
});

// The box is run from the page that shows production, by a person the box made an operator. The
// rows are marked, so nobody else is drawn one — and a machine's own console has none at all.
describe("the box's screens", () => {
  it("are an operator's, on the gateway's console", () => {
    expect(screensOf(BOX_SCREENS, "hosted", true).map((screen) => screen.name)).toEqual(["Organizations", "Fleet", "Routes", "Box usage", "Box settings"]);
    expect(BOX_SCREENS.every((screen) => screen.operator === true && screen.group === "box" && screen.path.startsWith("box/"))).toBe(true);
  });

  it("are drawn for nobody else", () => {
    expect(screensOf(BOX_SCREENS, "hosted")).toEqual([]);
    expect(screensOf(BOX_SCREENS, "hosted", false)).toEqual([]);
    expect(screensOf(BOX_SCREENS, "local", true)).toEqual([]);
  });

  it("leave an org's own screens as they were, operator or not", () => {
    expect(screensOf(ORG_SCREENS, "hosted", true)).toEqual(screensOf(ORG_SCREENS, "hosted"));
  });
});

describe("a machine's own console", () => {
  it("looks at the sandbox, and has none of the org's accounts", () => {
    expect(WORLD_OF.local).toBe("sandbox");
    expect(names(ORG_SCREENS, "local")).toEqual(["Home", "Overview", "Live", "Sessions", "Evals", "Phone testing"]);
  });

  it("has every screen of an agent, Dev chat among them", () => {
    expect(names(AGENT_SCREENS, "local")).toEqual(["Talk", "Chat", "Dev chat", "Calls", "Sessions", "Pipeline", "Knowledge", "Memory", "Evals", "Widget"]);
  });

  it("sends no authorization: `pinecall serve` signs what it forwards", () => {
    expect(headersFor({ base: "/", key: "" })).toEqual({});
    expect(headersFor({ base: "/", key: "", corner: "mem_2" })).toEqual({ "pinecall-corner": "mem_2" });
    expect(headersFor({ base: "/", key: "pk_1" })).toEqual({ authorization: "Bearer pk_1" });
  });
});
