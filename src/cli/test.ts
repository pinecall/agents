/** `pinecall test [paths]`: the goldens, through the app this terminal is holding, scored by the runtime. */

import { existsSync, watch } from "node:fs";
import { parseArgs } from "node:util";

import { Pinecall } from "../client/index.js";

import { modelOf } from "../runtime/connect.js";
import { theDoor } from "./env.js";
import type { Group } from "./groups.js";
import { load } from "./load.js";
import type { Wanted } from "./testing/gateway.js";
import { GOLDENS, goldensIn, matching, NO_GOLDENS } from "./testing/goldens.js";
import { mountedForASuite, ranSuite } from "./testing/suite.js";

export const group: Group = {
  purpose: "the goldens, run through the app in this terminal's own process",
  run,
};

const USAGE =
  "usage: pinecall test [paths] [--agent agent.tsx] [--model m]… [--grep x] [--watch] [--json]\n" +
  "       pinecall test --voice [--background-noise dB] [--packet-loss 0.05]\n";

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
      agent: { type: "string" },
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
  if (positionals.length === 0 && !existsSync(GOLDENS)) {
    process.stderr.write(`${NO_GOLDENS}\n${USAGE}`);
    return 2;
  }

  const loaded = await load(values.agent);
  const pc = new Pinecall({ url: door.url, apiKey: door.apiKey });
  const held = mountedForASuite(loaded, pc);
  const models = (values.model ?? []).map(modelOf).filter((model) => model !== undefined);

  try {
    await pc.connect();
    const suite = async (): Promise<number> => {
      const goldens = matching(await goldensIn(positionals), values.grep);
      if (goldens.length === 0) {
        process.stderr.write(`no golden matched${values.grep === undefined ? "" : ` --grep ${values.grep}`}\n`);
        return 2;
      }
      return await ranSuite({ door, loaded, held, goldens, models, line: aLine(values), out, json: values.json === true });
    };
    const code = await suite();
    if (values.watch !== true) return code;
    return await watching(positionals, suite, out);
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
