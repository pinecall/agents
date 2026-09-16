/** `pinecall test [paths]`: the goldens, through the app this terminal is holding, scored by the runtime. */

import { existsSync, watch } from "node:fs";
import { parseArgs } from "node:util";

import { Pinecall } from "../client/index.js";

import { modelOf } from "../runtime/connect.js";
import { theDoor } from "./env.js";
import type { Group } from "./groups.js";
import { load } from "./load.js";
import { AGENT_FLAG, hasDirectory, homesFor, type Home } from "./home.js";
import type { Wanted } from "./testing/gateway.js";
import { GOLDENS, goldensIn, matching, NO_GOLDENS } from "./testing/goldens.js";
import { mountedForASuite, ranSuite } from "./testing/suite.js";

const USAGE =
  "usage: pinecall test [paths] [--agent <name>] [--file agent.tsx] [--model m]… [--grep x] [--watch] [--json]\n" +
  "       pinecall test --voice [--background-noise dB] [--packet-loss 0.05]\n";

export const group: Group = {
  purpose: "the goldens, run through the app in this terminal's own process",
  usage: `${USAGE}
  Ring 1: every golden of test/goldens through the class this terminal holds, scored by the
  gateway's judges, printed as a matrix. Exits 1 when a golden did not hold, and writes every
  broken one to .pinecall/evals/<run>/ with the requests the model answered.

  [paths]             files or directories of goldens; the whole of test/goldens when none
  --file agent.tsx    which class to mount, when the directory holds more than one
  --model m           a column of the matrix: vendor/model, repeatable
  --grep x            only the goldens whose name matches
  --watch             run again whenever a file changes
  --json              the run as one JSON document instead of the matrix
  --voice             ring 2: the same goldens said out loud on a real line
  --background-noise  dB under the caller, on a spoken run: a television behind them
  --packet-loss       the share of the caller's packets that never arrive, 0 to 1`,
  run,
};

// Ring 2: the same goldens, said out loud. Only the three fields a spoken run adds travel — a
// written run must not carry a `voice: false` that reads as a decision somebody made.
function aLine(values: { voice?: boolean; "background-noise"?: string; "packet-loss"?: string }): Partial<Wanted> {
  if (values.voice !== true) return {};
  const noise = numberOf(values["background-noise"]);
  const loss = numberOf(values["packet-loss"]);
  return {
    voice: true,
    ...(noise === undefined ? {} : { interferer_db: noise }),
    ...(loss === undefined ? {} : { packet_loss: loss }),
  };
}

/** A flag that must be a number to mean anything: anything else is left out rather than sent as NaN. */
function numberOf(said: string | undefined): number | undefined {
  if (said === undefined) return undefined;
  const value = Number(said);
  return Number.isFinite(value) ? value : undefined;
}

// How long a change waits before the suite runs again: two saves of the same file in an editor
// are one change to a person, and a run costs real calls.
const SETTLE_MS = 150;

/**
 * The class is mounted HERE, in this process, exactly as `pinecall chat` mounts it: the tenant's
 * @tool bodies run against the tenant's own database and a breakpoint in one is reachable. The
 * gateway drives the conversations and scores them, because the judge, the keys and the log are
 * its — see docs/decisions/pinecall-test.md. The suite itself is `testing/suite.ts`, which the
 * console runs too.
 */
export async function run(argv: string[], out: NodeJS.WritableStream = process.stdout): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      file: { type: "string" },
      ...AGENT_FLAG,
      model: { type: "string", multiple: true },
      grep: { type: "string" },
      watch: { type: "boolean", default: false },
      json: { type: "boolean", default: false },
      voice: { type: "boolean", default: false },
      "background-noise": { type: "string" },
      "packet-loss": { type: "string" },
    },
  });
  const door = theDoor();
  if (door === undefined) return 2;
  // A project of several agents: each agent's goldens through its own class, one after another,
  // and the exit code is the worst of them. Paths typed name goldens of one agent, so they need one.
  const homes = await homesFor(values.file, values.agent);
  if (homes.length > 1) {
    if (positionals.length > 0 || values.watch === true) {
      process.stderr.write(`paths and --watch are for one agent: add --agent ${homes.map((home) => home.name).join(" or --agent ")}\n`);
      return 2;
    }
    let worst = 0;
    for (const home of homes) {
      if (!hasDirectory(home.goldens)) {
        out.write(`${home.name} · no goldens at ${home.goldens}\n`);
        continue;
      }
      worst = Math.max(worst, await suiteOf(home, [home.goldens], door, values, out));
    }
    return worst;
  }
  const home = homes[0]!;
  const paths = positionals.length > 0 ? positionals : [home.goldens];
  if (positionals.length === 0 && !existsSync(home.goldens)) {
    process.stderr.write(`${NO_GOLDENS.replace(GOLDENS, home.goldens)}\n${USAGE}`);
    return 2;
  }
  if (values.watch !== true) return await suiteOf(home, paths, door, values, out);

  const loaded = await load(home.file);
  const pc = new Pinecall({ url: door.url, apiKey: door.apiKey });
  const held = mountedForASuite(loaded, pc);
  const models = (values.model ?? []).map(modelOf).filter((model) => model !== undefined);

  try {
    await pc.connect();
    const suite = async (): Promise<number> => {
      const goldens = matching(await goldensIn(paths), values.grep);
      if (goldens.length === 0) {
        process.stderr.write(`no golden matched${values.grep === undefined ? "" : ` --grep ${values.grep}`}\n`);
        return 2;
      }
      return await ranSuite({ door, loaded, held, goldens, models, line: aLine(values), out, json: values.json === true });
    };
    await suite();
    return await watching(paths, suite, out);
  } finally {
    pc.close();
  }
}

// A change to a golden re-runs the suite; a change to the class does not, because the class is
// already imported into this process and node will not import it twice. The line says so, so that
// nobody watches a stale agent answer a fresh golden.
async function watching(
  paths: string[],
  suite: () => Promise<number>,
  out: NodeJS.WritableStream,
): Promise<number> {
  const watched = paths.length > 0 ? paths : [GOLDENS];
  out.write(`watching ${watched.join(" ")} — restart to pick up a change to the class\n`);
  let running = false;
  let pending: NodeJS.Timeout | undefined;
  for (const path of watched) {
    watch(path, { recursive: true }, () => {
      if (pending !== undefined) clearTimeout(pending);
      pending = setTimeout(() => {
        if (running) return;
        running = true;
        void suite().finally(() => (running = false));
      }, SETTLE_MS);
    });
  }
  // The watchers hold the process; a person ends it with the same ctrl-C that ends `run`.
  return await new Promise<number>(() => {});
}

/** One agent's goldens through its own class, mounted here for the length of the run. */
async function suiteOf(
  home: Home,
  paths: string[],
  door: NonNullable<ReturnType<typeof theDoor>>,
  values: Parameters<typeof aLine>[0] & { grep?: string | undefined; model?: string[] | undefined; json?: boolean | undefined },
  out: NodeJS.WritableStream,
): Promise<number> {
  const loaded = await load(home.file);
  const pc = new Pinecall({ url: door.url, apiKey: door.apiKey });
  const held = mountedForASuite(loaded, pc);
  const models = (values.model ?? []).map(modelOf).filter((model) => model !== undefined);
  try {
    await pc.connect();
    const goldens = matching(await goldensIn(paths), values.grep);
    if (goldens.length === 0) {
      process.stderr.write(`no golden matched${values.grep === undefined ? "" : ` --grep ${values.grep}`}\n`);
      return 2;
    }
    return await ranSuite({ door, loaded, held, goldens, models, line: aLine(values), out, json: values.json === true });
  } finally {
    pc.close();
  }
}
