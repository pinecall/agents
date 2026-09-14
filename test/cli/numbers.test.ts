// `pinecall numbers`: the doors the org answers at, one line each, and the one verb that crosses
// the two worlds — an org buys ONE number, so moving it is what makes a staging run cost nothing.

import { describe, expect, it } from "vitest";

import { group, aLine, run } from "../../src/cli/numbers.js";
import { written } from "./said.js";

const A_NUMBER = "+34910000000";

function aDoor(over: Partial<Parameters<typeof aLine>[0]["route"]> = {}, source = "operator"): Parameters<typeof aLine>[0] {
  return {
    route: { number: A_NUMBER, channel: "phone", agent: "clinica-norte", env: "production", managed: false, ...over },
    source,
  };
}

describe("one door as a line", () => {
  it("is the number, the channel, whose it is and which world", () => {
    expect(aLine(aDoor())).toBe(`${A_NUMBER} · phone · → clinica-norte · production`);
  });

  // Only an operator's row can be moved or dropped, so a door the class declared says so rather
  // than looking like a row somebody could take away.
  it("says when it is the app's own declaration and not a row", () => {
    expect(aLine(aDoor({}, "app"))).toContain("declared by the app");
  });

  it("says when the box bought the number, because letting it go is not the same act", () => {
    expect(aLine(aDoor({ managed: true }))).toContain("bought here");
  });
});

describe("the verb's shape", () => {
  it("names the four sub-verbs, and `move` says what it is for", () => {
    expect(group.usage).toContain("pinecall numbers move <+34…> --env <production|sandbox>");
    expect(group.usage).toContain("cost nothing");
  });

  it("says this machine knows no gateway rather than knocking at a default one", async () => {
    const err = written();

    expect(await run(["move", A_NUMBER], { err: err.stream, env: { PINECALL_HOME: "/nowhere" } })).toBe(1);
    expect(err.text()).toContain("no gateway");
  });
});
