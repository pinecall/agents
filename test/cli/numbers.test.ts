// `pinecall numbers`: the doors the org answers at, one line each, and the one verb that crosses
// the two worlds — an org buys ONE number, so moving it is what makes a staging run cost nothing.

import { describe, expect, it } from "vitest";

import { group, aLine, run } from "../../src/cli/numbers.js";
import { pointingAt } from "./home.js";
import { written } from "./said.js";

const A_NUMBER = "+34910000000";

function aDoor(over: Partial<Parameters<typeof aLine>[0]["route"]> = {}): Parameters<typeof aLine>[0] {
  return {
    route: { number: A_NUMBER, channel: "phone", agent: "clinica-norte", env: "production", managed: false, ...over },
  };
}

describe("one door as a line", () => {
  it("is the number, the channel, whose it is and which world", () => {
    expect(aLine(aDoor())).toBe(`${A_NUMBER} · phone · → clinica-norte · production`);
  });

  it("says when the box bought the number, because letting it go is not the same act", () => {
    expect(aLine(aDoor({ managed: true }))).toContain("bought here");
  });
});

describe("the verb's shape", () => {
  // A number is one instance's: the runtime has no door that moves one, so neither does the verb.
  it("names three sub-verbs, and none moves a number between the worlds", () => {
    expect(group.usage).toContain("pinecall numbers drop <+34…>");
    expect(group.usage).not.toContain("numbers move");
  });

  // 2 is what every other verb answers with no key — this command cannot run, and a script reads
  // the difference. `numbers` answered 1, which is "something was measured and did not hold".
  // The flag has to leave this verb unhandled: the dispatcher is what turns node's "Unknown
  // option '--bogus'" into `no such flag for numbers: '--bogus'` and exit 2 (cli/index.ts).
  it("lets a flag it does not take reach the dispatcher, which names the verb", async () => {
    await expect(run(["list", "--bogus"], { env: pointingAt("http://127.0.0.1:1", "pc_test_a_key") })).rejects.toThrow(
      "Unknown option '--bogus'",
    );
  });

  it("says this folder is linked to no org rather than knocking at a default one", async () => {
    const err = written();

    expect(await run(["drop", A_NUMBER], { err: err.stream, env: {} })).toBe(2);
    expect(err.text()).toContain("`pinecall link`");
  });
});
