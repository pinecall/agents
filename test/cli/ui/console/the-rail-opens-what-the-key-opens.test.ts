/** The rail draws what the key's scopes open: every screen gated by exactly one scope, and none met as a 403. */

import { expect, test } from "vitest";

import { notOpened, opens, SCOPE_OF } from "../../../../src/cli/ui/console/lib/scopes";

// The gateway's closed set (runtime types/key.py). A screen gated by a word outside it would be a
// screen nobody could ever open.
const KEY_SCOPES = ["app", "calls", "talk", "supervise", "pipeline", "words", "knowledge", "memory", "evals", "numbers", "keys", "providers", "team", "usage"];

test("every gated screen names a scope the gateway has", () => {
  for (const [screen, scope] of Object.entries(SCOPE_OF)) {
    expect(KEY_SCOPES, `${screen} is gated by ${scope}`).toContain(scope);
  }
});

test("a qa key reads calls and evals, and nothing it would be refused", () => {
  const qa = ["calls", "evals"];
  expect(["calls", "sessions", "evals", "agents", "live"].every((screen) => opens(qa, screen))).toBe(true);
  expect(["talk", "chat", "pipeline", "settings", "lexicon", "knowledge", "memory", "numbers", "team", "usage"].some((screen) => opens(qa, screen))).toBe(false);
  // Every key has tokens of its own to see: the laptop `pinecall link` wrote, at least.
  expect(opens(qa, "tokens")).toBe(true);
});

test("a screen nobody gated is open to every key, and the sentence names the scope", () => {
  expect(opens([], "login")).toBe(true);
  expect(notOpened("team")).toBe("this key does not open team");
});
