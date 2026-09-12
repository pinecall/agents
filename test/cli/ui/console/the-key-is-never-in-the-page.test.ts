/** The org key is never in the page, the tab's own key lives in one file, and the bundle carries neither. */

import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "vitest";

const REPO = fileURLToPath(new URL("../../../..", import.meta.url));
const SOURCE = join(REPO, "src/cli/ui/console");
const VITE_CONFIG = join(SOURCE, "vite.config.ts");

// A key read out loud, as auth/keys.py mints it: the prefix nobody else uses and the bytes after
// it. If one of these is ever in a built file, somebody put a credential in the bundle.
const SHAPED_LIKE_A_KEY = /pk_[A-Za-z0-9_-]{20,}/;

// The two environment names the CLI reads its key from. A build that carries either of them is a
// build that was handed a key at compile time.
const AN_ENVIRONMENT_KEY = /PINECALL_(API|DEV)_KEY/;

// The page holds ONE credential — a person's scoped key, minted for this tab at login — and it is
// kept in exactly one file, in sessionStorage: one tab's, gone when the tab closes, surviving a
// reload. localStorage would outlive the session and be every tab's, so nothing may reach it.
test("only lib/session-key.ts reaches the tab's storage, and nothing reaches localStorage", () => {
  expect(sourceFilesReaching("sessionStorage")).toEqual(["lib/session-key.ts"]);
  expect(sourceFilesReaching("localStorage")).toEqual([]);
});

// The key rides one header and that header is spelled in one place: every door goes through
// api.ts, and the stream and the recording ask it for the headers rather than writing their own.
test("only lib/api.ts writes the authorization header", () => {
  expect(sourceFilesReaching("authorization")).toEqual(["lib/api.ts"]);
});

// The test builds what it greps, into a directory of its own: a check about the bundle that
// depended on somebody having run the build first was a check that passed by being skipped.
test("the built page carries no key of its own", () => {
  const built = builtFiles(buildTheConsole());
  expect(built.length, "vite built nothing").toBeGreaterThan(0);
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

/** The console, built by vite into a fresh directory: the very bundle the gateway would serve. */
function buildTheConsole(): string {
  const out = mkdtempSync(join(tmpdir(), "pinecall-console-"));
  execFileSync("pnpm", ["exec", "vite", "build", "--config", VITE_CONFIG, "--outDir", out, "--logLevel", "error"], {
    cwd: REPO,
    stdio: "pipe",
  });
  return out;
}

/** The built page and everything it loads, as name and text. */
function builtFiles(built: string): [string, string][] {
  return filesUnder(built)
    .filter((file) => /\.(js|css|html|map)$/.test(file))
    .map((file) => [relative(built, file), readFileSync(file, "utf8")]);
}

function filesUnder(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const here = join(root, entry.name);
    return entry.isDirectory() ? filesUnder(here) : [here];
  });
}
