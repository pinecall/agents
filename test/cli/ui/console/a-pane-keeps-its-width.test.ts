// A pane dragged wider or narrower is found as it was left: its width kept in localStorage under
// `pinecall.pane.*`, per pane, and forgotten on request.

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { forgetWidth, keepWidth, keptWidth } from "../../../../src/cli/ui/console/lib/pane-widths";

const kept = new Map<string, string>();

beforeEach(() => {
  kept.clear();
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (name: string) => kept.get(name) ?? null,
      setItem: (name: string, value: string) => void kept.set(name, value),
      removeItem: (name: string) => void kept.delete(name),
    },
  };
});

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe("a pane's width", () => {
  it("is kept as a whole number, under a name of the panes' own", () => {
    keepWidth("live.call", 412.6);
    expect([...kept.entries()]).toEqual([["pinecall.pane.live.call", "413"]]);
    expect(keptWidth("live.call")).toBe(413);
  });

  it("is nothing when none was kept, or what was kept is not a width", () => {
    expect(keptWidth("live.call")).toBeNull();
    kept.set("pinecall.pane.live.call", "pk_not_a_number");
    expect(keptWidth("live.call")).toBeNull();
  });

  it("is forgotten on a reset", () => {
    keepWidth("live.call", 400);
    forgetWidth("live.call");
    expect(keptWidth("live.call")).toBeNull();
  });

  it("costs nothing where the browser refuses storage", () => {
    (globalThis as { window?: unknown }).window = {
      get localStorage(): never {
        throw new Error("denied");
      },
    };
    expect(() => keepWidth("live.call", 400)).not.toThrow();
    expect(keptWidth("live.call")).toBeNull();
  });
});
