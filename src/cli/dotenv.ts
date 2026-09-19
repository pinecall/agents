/** A project's `.env`: the nearest one up from where a verb runs, read as dotenv lines, and written by `link`. */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const DOTENV = ".env";

/** The nearest `.env` from this directory up to the filesystem's root, or undefined when none. */
export function nearestDotenv(from: string): string | undefined {
  for (let at = from; ; at = dirname(at)) {
    const file = join(at, DOTENV);
    if (existsSync(file)) return file;
    if (dirname(at) === at) return undefined;
  }
}

/**
 * The file's variables. The dotenv every tool agrees on and nothing more: `NAME=value`, a value in
 * matching quotes is taken inside them, `export ` in front is allowed, and a line starting with `#`
 * or holding no `=` says nothing.
 */
export function readDotenv(file: string): Record<string, string> {
  const found: Record<string, string> = {};
  for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim().replace(/^export\s+/, "");
    const equals = line.indexOf("=");
    if (line.startsWith("#") || equals <= 0) continue;
    found[line.slice(0, equals).trim()] = unquoted(line.slice(equals + 1).trim());
  }
  return found;
}

/**
 * These variables written into the file: a line that names one is replaced where it stands, one
 * that is not there yet goes at the end, and every other line — a comment, the app's own
 * variables — is left exactly as it was. A file that does not exist is made readable by its owner
 * alone, because what it holds is a key.
 */
export function writeDotenv(file: string, values: Record<string, string>): void {
  const lines = existsSync(file) ? readFileSync(file, "utf8").replace(/\n$/, "").split("\n") : [];
  const left = new Map(Object.entries(values));
  const written = lines.map((line) => {
    const name = line.trim().replace(/^export\s+/, "").split("=")[0]?.trim();
    const value = name === undefined ? undefined : left.get(name);
    if (name === undefined || value === undefined) return line;
    left.delete(name);
    return `${name}=${value}`;
  });
  for (const [name, value] of left) written.push(`${name}=${value}`);
  writeFileSync(file, `${written.join("\n")}\n`, { mode: 0o600 });
}

/**
 * Whether git keeps this file out of a commit: a key committed is a key published. Git answers it
 * — every `.gitignore` up to the repository's root, and the global one — so the answer is the one
 * a commit would act on. Outside a repository, or with no git at all, nothing can commit it.
 */
export function ignoredByGit(file: string): boolean {
  const asked = spawnSync("git", ["check-ignore", "-q", file], { cwd: dirname(file), stdio: "ignore" });
  // 0 ignored · 1 not ignored · 128 not a repository; an error is no git on this machine.
  return asked.error !== undefined || asked.status !== 1;
}

function unquoted(value: string): string {
  const quote = value[0];
  if ((quote === '"' || quote === "'") && value.length >= 2 && value.endsWith(quote)) return value.slice(1, -1);
  return value;
}
