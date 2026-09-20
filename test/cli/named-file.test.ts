// A file a person named on the command line: what it says when the path or the JSON is wrong.

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CannotRun } from "../../src/cli/cannot-run.js";
import { readNamedJson } from "../../src/cli/named-file.js";

function aFile(name: string, text: string): string {
  const path = join(mkdtempSync(join(tmpdir(), "named-")), name);
  writeFileSync(path, text, "utf8");
  return path;
}

describe("a JSON file a flag named", () => {
  it("is parsed when it is there and it is JSON", () => {
    expect(readNamedJson("--state", aFile("state.json", '{"stage":"choose"}'))).toEqual({ stage: "choose" });
  });

  // node's own `ENOENT: no such file or directory, open 'policy.json'` is what a typo used to
  // reach a person as, and it names neither the flag nor what to do about it.
  it("says which flag named a path that is not there, and cannot run", () => {
    let failed: unknown;
    try {
      readNamedJson("--policy", "/no/such/policy.json");
    } catch (thrown) {
      failed = thrown;
    }

    expect(failed).toBeInstanceOf(CannotRun);
    expect((failed as Error).message).toBe("--policy: cannot read /no/such/policy.json — no such file");
  });

  it("says which file is not JSON, with the parser's own complaint", () => {
    const path = aFile("policy.json", "{banned: [] }");

    expect(() => readNamedJson("--policy", path)).toThrow(new RegExp(`--policy: ${path.replace(/\//g, "\\/")} is not JSON`));
  });
});
