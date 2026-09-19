/** Signing out forgets the person's key: the browser holds none afterwards. */

import { beforeEach, expect, test } from "vitest";

import { forgetKey, keepKey, keptKey } from "../../../../src/cli/ui/console/lib/session-key";

// No DOM here, by the rule this directory runs under: what a browser gives these functions is a
// string store keyed by name, and that is the whole of what they use. A Map is that store.
const kept = new Map<string, string>();

beforeEach(() => {
  kept.clear();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: (name: string) => kept.get(name) ?? null,
        setItem: (name: string, value: string) => void kept.set(name, value),
        removeItem: (name: string) => void kept.delete(name),
      },
    },
  });
});

test("a person holds one key, and signing out leaves the browser holding none", () => {
  keepKey("pc_berna");

  expect(keptKey()).toBe("pc_berna");
  forgetKey();
  expect(keptKey()).toBeNull();
  expect(kept.size).toBe(0);
});

test("signing out of a tab that held nothing is not an error", () => {
  expect(() => forgetKey()).not.toThrow();
  expect(keptKey()).toBeNull();
});
