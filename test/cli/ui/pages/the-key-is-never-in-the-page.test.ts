/** The org key is never in the page, the tab's own key lives in one file, and the bundle carries neither. */

import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "vitest";

const REPO = fileURLToPath(new URL("../../../..", import.meta.url));
// The three directories that ARE the browser: what both pages wear, and one per page.
const PAGES = ["shared", "console", "admin"];
const SOURCE = join(REPO, "src/cli/ui");

// A key read out loud, as auth/keys.py mints it: the prefix nobody else uses and the bytes after
// it. If one of these is ever in a built file, somebody put a credential in the bundle.
const SHAPED_LIKE_A_KEY = /pk_[A-Za-z0-9_-]{20,}/;

// The two environment names the CLI reads its key from. A build that carries either of them is a
// build that was handed a key at compile time.
const AN_ENVIRONMENT_KEY = /PINECALL_(API|DEV)_KEY/;

// Each page holds ONE credential — the console a person's scoped key, the admin the box's ops key
// — and each keeps it in exactly one file. The admin's is one tab's, in sessionStorage. The
// console's person is the browser's since 2026-09-16 — a login code spends once, and a per-tab
// store left every other tab signed out — so its keys are in localStorage, and signing out forgets
// them in every tab; the world and the corner a tab looks at stay the tab's. Two files and not
// one, on purpose: the two credentials must never meet. `pane-widths.ts` is the one other file that
// reaches localStorage, and what it keeps is how wide a person dragged a pane: a number under a
// prefix of its own, which a test below holds it to.
test("one file per page reaches a browser's storage", () => {
  expect(sourceFilesReaching("sessionStorage")).toEqual(["admin/lib/ops-key.ts", "console/lib/session-key.ts"]);
  expect(sourceFilesReaching("localStorage")).toEqual(["console/lib/pane-widths.ts", "console/lib/session-key.ts"]);
});

// The key rides one header and that header is spelled in one place for both pages: every door
// goes through shared/api.ts, and the stream and the recording ask it for the headers rather than
// writing their own.
test("only shared/api.ts writes the authorization header", () => {
  expect(sourceFilesReaching("authorization")).toEqual(["shared/api.ts"]);
});

// The test builds what it greps, into a directory of its own: a check about the bundle that
// depended on somebody having run the build first was a check that passed by being skipped.
test.each(["console", "admin"])("the built %s carries no key of its own", (page) => {
  const built = builtFiles(buildThePage(page));
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
  return PAGES.flatMap((page) => filesUnder(join(SOURCE, page)))
    .filter((file) => reaching.test(readFileSync(file, "utf8")))
    .map((file) => relative(SOURCE, file))
    .sort();
}

/** One page, built by vite into a fresh directory: the very bundle the gateway would serve. */
function buildThePage(page: string): string {
  const out = mkdtempSync(join(tmpdir(), `pinecall-${page}-`));
  const config = join(SOURCE, page, "vite.config.ts");
  execFileSync("pnpm", ["exec", "vite", "build", "--config", config, "--outDir", out, "--logLevel", "error"], {
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
