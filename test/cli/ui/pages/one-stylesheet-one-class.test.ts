/** Two screens naming one class is one bundle overwriting itself: the collision, caught here. */

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "vitest";

const SOURCE = fileURLToPath(new URL("../../../../src/cli/ui", import.meta.url));

// Every screen owns its own stylesheet, and vite bundles a page's into one file that page wears.
// So a class is global whatever directory it was written in: `.mark` was the talk
// transcript's line AND the session timeline's cell, and the table's `width: 1.5em` squeezed the
// paragraph to one character a line (2026-09-08). A screen's class carries the thing it belongs
// to — `.said-mark`, `.timeline .mark` — and this test is what keeps that true.
const A_CLASS = /^\s*(\.[A-Za-z0-9_-]+)(?=[\s,{:])/gm;

// The one stylesheet that is deliberately shared: the page vocabulary every screen builds from.
const THE_SHARED_ONE = "shared/styles/page.css";

// One bundle per page, so a collision is a collision WITHIN a page; the vocabulary below is the
// one thing both wear, and neither may redefine it.
const PAGES = ["console", "admin"];

test.each(PAGES)("no class is defined by two of the %s's stylesheets", (page) => {
  const owners = new Map<string, string[]>();
  for (const file of stylesheets().filter((one) => one.startsWith(`${page}/`))) {
    for (const name of classesIn(readFileSync(join(SOURCE, file), "utf8"))) {
      owners.set(name, [...(owners.get(name) ?? []), file]);
    }
  }
  const shared = [...owners.entries()]
    .filter(([, files]) => new Set(files).size > 1)
    .map(([name, files]) => `${name}: ${[...new Set(files)].join(" and ")}`);
  expect(shared).toEqual([]);
});

test("no screen of either page redefines the vocabulary both wear", () => {
  const page = new Set(classesIn(readFileSync(join(SOURCE, THE_SHARED_ONE), "utf8")));
  const taken: string[] = [];
  for (const file of stylesheets().filter((one) => !one.startsWith("shared/"))) {
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
  return ["shared", "console", "admin"]
    .flatMap((page) => filesUnder(join(SOURCE, page)))
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
