// A ~/.pinecall of this test's own, with one profile in it. Every CLI test used to hand a verb
// its key through PINECALL_URL and PINECALL_API_KEY, because there was nowhere else to put one;
// there is a file now, and a verb reads only that.

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { writeProfile } from "../../src/cli/profiles.js";

/** An environment whose whole content is a home with one active profile pointing at that gateway. */
export function pointingAt(url: string, key: string): NodeJS.ProcessEnv {
  const home = mkdtempSync(join(tmpdir(), "pinecall-home-"));
  writeProfile("test", { url, key }, home);
  return { PINECALL_HOME: home };
}

/** A home with no profile at all: what a machine that has never logged in looks like. */
export function pointingNowhere(): NodeJS.ProcessEnv {
  return { PINECALL_HOME: mkdtempSync(join(tmpdir(), "pinecall-home-")) };
}
