/** `pinecall test [paths]`: the goldens, through the app this terminal is holding, scored by the runtime. */

import { existsSync, watch } from "node:fs";
import { parseArgs } from "node:util";

import { Pinecall } from "../client/index.js";

import type { Agent } from "../agent/agent.js";
import { modelOf, mount } from "../runtime/connect.js";
import { theDoor } from "./env.js";
import type { Group } from "./groups.js";
import { load, mountOptions } from "./load.js";
import { aRun, entriesOf, Refused, theRuns, type Door, type EvalRun } from "./testing/gateway.js";
import { GOLDENS, goldensIn, matching, NO_GOLDENS } from "./testing/goldens.js";
import { mediansOf } from "./testing/latency.js";
import { reportOf, type Latencies } from "./testing/matrix.js";
import { followed } from "./testing/progress.js";
import { Openings } from "./testing/seeding.js";

export const group: Group = {
  purpose: "the goldens, run through the app in this terminal's own process",
  run,
};

const USAGE =
  "usage: pinecall test [paths] [--agent agent.ts] [--model m]… [--grep x] [--watch] [--json]\n";

// Ring 2 is a synthetic caller on the wire — a room, a voice and a persona worker — and none of
// that is in this tree yet. The flag says so rather than running ring 1 and calling it voice,
// which would be a green suite that tested nothing it claimed to.
const NO_VOICE = "--voice is ring 2: it needs a room and a spoken caller, and neither is built yet\n";

// How long a change waits before the suite runs again: two saves of the same file in an editor
// are one change to a person, and a run costs real calls.
const SETTLE_MS = 150;

// The gateway runs one suite at a time and says so with a 409. Its own sentence is about the
// runner; this one is about what the person types next.
const BUSY = "a run is already going on {agent} ({id}) — pinecall runs show {id} to watch it";

/**
 * The class is mounted HERE, in this process, exactly as `pinecall chat` mounts it: the tenant's
 * @tool bodies run against the tenant's own database and a breakpoint in one is reachable. The
 * gateway drives the conversations and scores them, because the judge, the keys and the log are
 * its — see docs/decisions/pinecall-test.md.
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
    },
  });
  if (values.voice === true) {
    process.stderr.write(NO_VOICE);
    return 2;
  }
  const door = theDoor();
  if (door === undefined) return 2;
  if (positionals.length === 0 && !existsSync(GOLDENS)) {
    process.stderr.write(`${NO_GOLDENS}\n${USAGE}`);
    return 2;
  }

  const loaded = await load(values.agent);
  const url = door.url;
  const pc = new Pinecall({ url, apiKey: door.apiKey });
  // takesUnclaimed: false for the reason `chat` has it: this process holds the agent so that the
  // run reaches THIS class, and a real phone call must not ring in a terminal running a suite.
  // Every golden opens its call in its own state, handed to the instance through mount's own
  // `opening` seam — the one moment between the class's onCall and the first render.
  const openings = new Openings();
  const mounted = mount(loaded.ctor, {
    ...mountOptions(loaded, pc),
    takesUnclaimed: false,
    opening: (call) => openings.opening(call),
  });
  const models = (values.model ?? []).map(modelOf).filter((model) => model !== undefined);

  try {
    await pc.connect();
    const suite = async (): Promise<number> => {
      const goldens = matching(await goldensIn(positionals), values.grep);
      if (goldens.length === 0) {
        process.stderr.write(`no golden matched${values.grep === undefined ? "" : ` --grep ${values.grep}`}\n`);
        return 2;
      }
      openings.expects(goldens, models.length);
      const declaredAs = declaredBy(loaded.ctor);
      const pending = aRun(door, {
        agent: mounted.slug,
        goldens,
        ...(models.length > 0 ? { models } : {}),
        ...(mounted.agent.app === undefined ? {} : { app: mounted.agent.app }),
      });
      const watched = {
        agent: mounted.slug,
        goldens: goldens.length,
        models: models.length > 0 ? models.map((model) => `${model.provider}/${model.model}`) : [declaredAs],
        declaredAs,
      };
      let run: EvalRun;
      try {
        run = await followed(door, watched, pending, out, values.json === true);
      } catch (refused) {
        if (!(refused instanceof Refused) || refused.status !== 409) throw refused;
        process.stderr.write(`${await busy(door, mounted.slug, refused)}\n`);
        return 1;
      }
      const wrong = openings.mismatched(run);
      if (wrong !== undefined) process.stderr.write(`${wrong}\n`);
      return await reported(door, run, declaredAs, values.json === true, out);
    };
    const code = await suite();
    if (values.watch !== true) return code;
    return await watching(positionals, suite, out);
  } finally {
    pc.close();
  }
}

/** The run printed and answered for: exit 1 when a golden did not hold, whatever else went right. */
async function reported(
  door: Door,
  run: EvalRun,
  declaredAs: string,
  asJson: boolean,
  out: NodeJS.WritableStream,
): Promise<number> {
  const latencies = await latenciesOf(door, run);
  if (asJson) out.write(`${JSON.stringify({ run, latencies })}\n`);
  else out.write(`${reportOf(run, latencies, declaredAs).join("\n")}\n`);
  return run.status === "done" && (run.matrix?.failures.length ?? 0) === 0 ? 0 : 1;
}

/**
 * The three latencies per call, read off each call's own log. The runner's matrix carries what the
 * graphs answered and `call.summary`; the per-turn metrics entries live in the log, so the report
 * reads them from there rather than asking anybody to summarise them a second time.
 */
async function latenciesOf(door: Door, run: EvalRun): Promise<Latencies> {
  const latencies: Latencies = {};
  for (const opened of run.calls) latencies[opened.call] = mediansOf(await entriesOf(door, opened.call));
  return latencies;
}

// Which run has the AGENT is read off the door that lists them rather than out of the refusal's
// sentence: the runner holds one run per agent, so the newest running run of THIS agent is the
// one holding it — the org's newest run may well be somebody else's agent.
async function busy(door: Door, agent: string, refused: Refused): Promise<string> {
  const newest = (await theRuns(door, 1, agent))[0];
  if (newest?.status !== "running") return refused.message;
  return BUSY.replaceAll("{id}", newest.id).replace("{agent}", agent);
}

/** The model a person recognises: the word the class itself wrote, `llm = "haiku"` and no table. */
function declaredBy(ctor: new () => Agent): string {
  const declared = (new ctor() as { llm?: unknown }).llm;
  return typeof declared === "string" && declared !== "" ? declared : "the app's own model";
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
