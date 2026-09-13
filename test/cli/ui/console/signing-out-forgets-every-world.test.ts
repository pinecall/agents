/** Signing out forgets every world's key, because forgetting one leaves the other in the tab. */

import { beforeEach, expect, test } from "vitest";

import { forgetEveryKey, keepKey, keptKey, WORLDS } from "../../../../src/cli/ui/console/lib/session-key";

// No DOM here, by the rule this directory runs under: what a browser gives these four functions is
// a string store keyed by name, and that is the whole of what they use. A Map is that store.
const kept = new Map<string, string>();

beforeEach(() => {
  kept.clear();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      sessionStorage: {
        getItem: (name: string) => kept.get(name) ?? null,
        setItem: (name: string, value: string) => void kept.set(name, value),
        removeItem: (name: string) => void kept.delete(name),
      },
    },
  });
});

test("a person holding both worlds' keys holds neither afterwards", () => {
  keepKey("production", "pk_live");
  keepKey("development", "pk_dev");

  forgetEveryKey();

  expect(WORLDS.map((world) => keptKey(world))).toEqual([null, null]);
});

test("forgetting only the world on screen would leave the other one signed in", () => {
  // The toggle mints the second key from the first, so a key left behind is a way back in as the
  // same person — which is not what anybody means by signing out.
  keepKey("production", "pk_live");
  keepKey("development", "pk_dev");

  forgetEveryKey();

  expect(kept.size).toBe(0);
});

test("signing out of a tab that held nothing is not an error", () => {
  expect(() => forgetEveryKey()).not.toThrow();
  expect(keptKey("production")).toBeNull();
});
