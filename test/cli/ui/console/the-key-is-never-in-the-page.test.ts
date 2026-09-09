/** The absence, proven: no browser storage in the source, no key and no key's name in the bundle. */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "vitest";

const REPO = fileURLToPath(new URL("../../../..", import.meta.url));
const SOURCE = join(REPO, "src/cli/ui/console");
// Where vite writes it, which is where `pinecall ui` serves it from and where it is published.
const BUILT = join(REPO, "dist/cli/ui/console");

// A key read out loud, as auth/keys.py mints it: the prefix nobody else uses and the bytes after
// it. If one of these is ever in a built file, somebody put a credential in the bundle.
const SHAPED_LIKE_A_KEY = /pk_[A-Za-z0-9_-]{20,}/;

// The two environment names the CLI reads its key from. A build that carries either of them is a
// build that was handed a key at compile time.
const AN_ENVIRONMENT_KEY = /PINECALL_(API|DEV)_KEY/;

// The console holds no key: `pinecall ui` signs every request in front of it. So there is nothing
// for the page to remember, and nothing it may write into a browser's storage.
test("the console never reaches a browser's storage", () => {
  expect(sourceFilesReaching("localStorage")).toEqual([]);
  expect(sourceFilesReaching("sessionStorage")).toEqual([]);
});

test("the console sends no authorization header of its own", () => {
  expect(sourceFilesReaching("authorization")).toEqual([]);
});

test("the built page carries no key of its own", () => {
  const built = builtFiles();
  expect(built.length, "nothing to grep: run `scripts/build` first").toBeGreaterThan(0);
  for (const [name, text] of built) {
    expect(text, `${name} carries something shaped like a key`).not.toMatch(SHAPED_LIKE_A_KEY);
    expect(text, `${name} names an environment key`).not.toMatch(AN_ENVIRONMENT_KEY);
  }
});

// A USE and not a mention: the name followed by a dot, a bracket or a colon. Prose is free to say
// which storage the console does not touch and why.
/** Every source file that uses that name, named from src/, so a failure names it. */
function sourceFilesReaching(name: string): string[] {
  const reaching = new RegExp(`\\b${name}\\s*[.[:]`);
  return filesUnder(SOURCE)
    .filter((file) => reaching.test(readFileSync(file, "utf8")))
    .map((file) => relative(SOURCE, file))
    .sort();
}

/** The built page and everything it loads, as name and text. Empty when nobody has built one. */
function builtFiles(): [string, string][] {
  if (!existsSync(BUILT)) {
    return [];
  }
  return filesUnder(BUILT)
    .filter((file) => /\.(js|css|html|map)$/.test(file))
    .map((file) => [relative(BUILT, file), readFileSync(file, "utf8")]);
}

function filesUnder(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const here = join(root, entry.name);
    return entry.isDirectory() ? filesUnder(here) : [here];
  });
}
