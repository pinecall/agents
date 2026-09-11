/** The console's own door to a broken golden's reproduction: the file the suite left on this disk. */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { REPRODUCTIONS } from "../testing/reproduction.js";
import { anObject, aString } from "./asked.js";
import { Refusal } from "./refusal.js";

/** Which goldens of one run were written out, and where that folder is. */
export interface Written {
  run: string;
  folder: string;
  goldens: string[];
}

/** What the server needs from the reproduction door, and nothing of how it reads a folder. */
export interface Reproducing {
  /** Which goldens of this run left a file behind. A green run leaves none. */
  roster(asked: unknown): Promise<Written>;
  /** One of them, whole: the golden as written, the requests, the verdicts, the log. */
  read(asked: unknown): Promise<unknown>;
}

const A_RUN = /^[A-Za-z0-9_-]{1,64}$/;
const A_GOLDEN = /^[^/\\]{1,120}$/;

const NOT_HERE = (run: string): string =>
  `no reproduction of ${run} under ${REPRODUCTIONS}: the suite writes them where it was run, ` +
  "and a run that was green wrote none";

/**
 * One `Reproducing` for the life of a `pinecall ui`. A reproduction is a FILE the suite left in
 * the directory it ran in — `.pinecall/evals/<run>/<golden>.json` — so the page can only have it
 * through the process standing there. It carries the one thing the log deliberately does not: the
 * requests the model actually answered, region by region, because the log keeps a hash of each
 * prompt block on purpose.
 */
export function reproducingFrom(under: string = REPRODUCTIONS): Reproducing {
  return {
    async roster(asked: unknown): Promise<Written> {
      const run = theRun(asked);
      const folder = join(under, run);
      if (!existsSync(folder)) throw new Refusal(404, NOT_HERE(run));
      const goldens = readdirSync(folder)
        .filter((name) => name.endsWith(".json"))
        .map((name) => name.slice(0, -".json".length))
        .sort();
      return { run, folder, goldens };
    },

    async read(asked: unknown): Promise<unknown> {
      const given = anObject(asked, "a reproduction");
      const run = theRun(given);
      const golden = aString(given, "golden");
      // A name out of the page is a name off this disk: neither half may climb out of the folder
      // the suite wrote, which is why both are shapes and not just strings.
      if (!A_GOLDEN.test(golden)) throw new Refusal(422, "a golden is a name, not a path");
      const file = join(under, run, `${golden}.json`);
      if (!existsSync(file)) throw new Refusal(404, `no reproduction of ${golden} in ${join(under, run)}`);
      return JSON.parse(readFileSync(file, "utf8"));
    },
  };
}

function theRun(asked: unknown): string {
  const run = aString(anObject(asked, "a reproduction"), "run");
  if (!A_RUN.test(run)) throw new Refusal(422, "a run is an id, not a path");
  return run;
}
