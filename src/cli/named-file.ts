/** A JSON file a person named on the command line, and what it says when it cannot be read. */

import { readFileSync } from "node:fs";

import { cannotRun } from "./cannot-run.js";

/**
 * The file that flag names, parsed. A path with a typo in it used to reach the person as node's
 * own `ENOENT: no such file or directory, open 'policy.json'`, and a file with a trailing comma
 * as `Unexpected token }` with no file in the sentence at all (`eval --policy`, `prompt --state`,
 * production, 2026-09-20). Both are the same mistake — a file that is not what the flag promised
 * — so both read as one sentence naming the flag, the file, and what was wrong with it.
 */
export function readNamedJson<T>(flag: string, file: string): T {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (failed) {
    throw cannotRun(`${flag}: cannot read ${file} — ${(failed as NodeJS.ErrnoException).code === "ENOENT" ? "no such file" : saidBy(failed)}`);
  }
  try {
    return JSON.parse(text) as T;
  } catch (failed) {
    throw cannotRun(`${flag}: ${file} is not JSON — ${saidBy(failed)}`);
  }
}

function saidBy(failed: unknown): string {
  return failed instanceof Error ? failed.message : String(failed);
}
