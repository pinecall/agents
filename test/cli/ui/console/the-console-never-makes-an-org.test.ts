/** The console signs a person IN and never makes an org: the sign-up is the CLI's door and the API's, not this page's. */

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "vitest";

const SOURCE = fileURLToPath(new URL("../../../../src/cli/ui/console", import.meta.url));

// The console ships inside the runtime distribution: every self-hoster serves this page. A
// registration form in it would be one flag away from open registration on somebody else's box,
// and making an org is not what a control plane for an existing org is for. So the page knocks at
// `/v1/login` to get this tab a key and never at `/v1/signup` to make the org that key belongs to.
test("no file of the console knocks at the sign-up door", () => {
  expect(filesReaching("/v1/signup")).toEqual([]);
});

// The one door it does knock at with no key: the login, which mints a key for an org that exists.
test("the login door is reached from exactly one file", () => {
  expect(filesReaching("/v1/login`")).toEqual(["lib/login.ts"]);
});

// A slug is minted by the gateway out of what a sign-up typed. With no sign-up here, nothing in
// the page derives one — the copy that used to live beside the form is gone, not moved.
test("nothing in the console derives an org's slug", () => {
  expect(filesReaching("normalize(\"NFD\")")).toEqual([]);
});

// What the file DOES, not what it says about itself: a docstring may name the sign-up door and
// point at the CLI, and that is the opposite of knocking at it. Comments come out first.
function filesReaching(text: string): string[] {
  return sources().filter((file) => code(readFileSync(join(SOURCE, file), "utf8")).includes(text));
}

function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function sources(): string[] {
  const found: string[] = [];
  const walk = (at: string): void => {
    for (const entry of readdirSync(at, { withFileTypes: true })) {
      const path = join(at, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.(ts|tsx)$/.test(entry.name)) found.push(relative(SOURCE, path));
    }
  };
  walk(SOURCE);
  return found.sort();
}
