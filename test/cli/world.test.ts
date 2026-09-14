// `--env` is an assertion and never a selector: a key opens one world, and the flag is a person
// saying which one they believe they hold. The refusal is the whole value — an agent that lands in
// production because of the key that happened to be active is the bug this replaces.

import { describe, expect, it } from "vitest";

import type { Who } from "../../src/cli/whoami.js";
import { cannotTell, notThisWorld, PRODUCTION, SANDBOX } from "../../src/cli/world.js";

function opening(env: string): Who {
  return { org: "clinica", slug: "clinica", key_id: "k_1", label: "the laptop", env };
}

describe("which world a verb may work in", () => {
  it("is the sandbox when nothing is said, and a sandbox key passes", () => {
    expect(notThisWorld("run", opening(SANDBOX), undefined)).toBeUndefined();
  });

  it("refuses a production key that said nothing, and names both ways out", () => {
    const refused = notThisWorld("run", opening(PRODUCTION), undefined);

    expect(refused).toContain("this key opens production");
    expect(refused).toContain("pinecall run --env production");
    expect(refused).toContain("pinecall use <profile>");
  });

  it("takes a production key from anybody who typed the world out loud", () => {
    expect(notThisWorld("run", opening(PRODUCTION), PRODUCTION)).toBeUndefined();
  });

  // The flag chooses nothing: what it names has to be what the key already opens, or the verb
  // stops. Before this the two could disagree and only the gateway knew.
  it("refuses a flag the key disagrees with, and says a flag cannot change a key", () => {
    const refused = notThisWorld("run", opening(SANDBOX), PRODUCTION);

    expect(refused).toContain("this key opens sandbox");
    expect(refused).toContain("no flag changes that");
  });

  it("names the two worlds when the flag is a word that is neither", () => {
    expect(notThisWorld("run", opening(SANDBOX), "staging")).toBe(
      '--env takes production or sandbox, not "staging"',
    );
  });

  it("will not guess when the gateway would not say which world the key opens", () => {
    expect(cannotTell("chat", new Error("fetch failed"))).toBe(
      "`pinecall chat` will not guess which world this key opens: fetch failed",
    );
  });
});
