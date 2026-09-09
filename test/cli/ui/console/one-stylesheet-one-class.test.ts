/** Two screens naming one class is one bundle overwriting itself: the collision, caught here. */

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "vitest";

const SOURCE = fileURLToPath(new URL("../../../../src/cli/ui/console", import.meta.url));

// Every screen owns its own stylesheet, and vite bundles them all into one file the whole console
// wears. So a class is global whatever directory it was written in: `.mark` was the talk
// transcript's line AND the session timeline's cell, and the table's `width: 1.5em` squeezed the
// paragraph to one character a line (2026-09-08). A screen's class carries the thing it belongs
// to — `.said-mark`, `.timeline .mark` — and this test is what keeps that true.
const A_CLASS = /^\s*(\.[A-Za-z0-9_-]+)(?=[\s,{:])/gm;

// The one stylesheet that is deliberately shared: the page vocabulary every screen builds from.
const THE_SHARED_ONE = "styles/page.css";

test("no class is defined by two stylesheets", () => {
  const owners = new Map<string, string[]>();
  for (const file of stylesheets()) {
    for (const name of classesIn(readFileSync(join(SOURCE, file), "utf8"))) {
      owners.set(name, [...(owners.get(name) ?? []), file]);
    }
  }
  const shared = [...owners.entries()]
    .filter(([, files]) => new Set(files).size > 1)
    .map(([name, files]) => `${name}: ${[...new Set(files)].join(" and ")}`);
  expect(shared).toEqual([]);
});

test("a screen never redefines the page vocabulary", () => {
  const page = new Set(classesIn(readFileSync(join(SOURCE, THE_SHARED_ONE), "utf8")));
  const taken: string[] = [];
  for (const file of stylesheets().filter((one) => one !== THE_SHARED_ONE)) {
    for (const name of classesIn(readFileSync(join(SOURCE, file), "utf8"))) {
      if (page.has(name)) taken.push(`${name}: ${file}`);
    }
  }
  expect(taken).toEqual([]);
});

/** Every top-level class a stylesheet defines. A nested selector belongs to what it is nested in. */
function classesIn(css: string): string[] {
  return [...css.matchAll(A_CLASS)].map((found) => found[1] as string);
}

function stylesheets(): string[] {
  return filesUnder(SOURCE)
    .filter((file) => file.endsWith(".css"))
    .map((file) => relative(SOURCE, file))
    .sort();
}

function filesUnder(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const here = join(root, entry.name);
    return entry.isDirectory() ? filesUnder(here) : [here];
  });
}
