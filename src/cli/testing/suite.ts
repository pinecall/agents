/** One suite run through the class mounted in this process: written once, for the terminal verb and the console. */

import type { Camel, ModelConfig } from "@pinecall/protocol";
import type { Pinecall } from "../../client/index.js";

import type { Agent } from "../../agent/agent.js";
import { mount, type Mounted } from "../../runtime/connect.js";
import { type Loaded, mountOptions } from "../load.js";
import { aRun, entriesOf, Refused, theRuns, type Door, type Entry, type EvalRun, type Wanted } from "./gateway.js";
import type { Golden } from "./goldens.js";
import { mediansOf } from "./latency.js";
import { reportOf, type Latencies } from "./matrix.js";
import { followed } from "./progress.js";
import { whereTheyAre, writtenOut } from "./reproduction.js";
import { Openings } from "./seeding.js";

// The gateway runs one suite at a time and says so with a 409. Its own sentence is about the
// runner; this one is about what the person types next.
const BUSY = "a run is already going on {agent} ({id}) — pinecall runs show {id} to watch it";

/** The class, mounted for a suite, and the openings that hand each call its golden's state. */
export interface ForASuite {
  mounted: Mounted;
  openings: Openings;
}

/** One suite: which goldens, under which models, on what line, printed where. */
export interface Suite {
  door: Door;
  loaded: Loaded;
  held: ForASuite;
  goldens: Golden[];
  models: Camel<ModelConfig>[];
  /** Ring 2's three fields, when the suite is spoken; nothing at all when it is written. */
  line: Partial<Wanted>;
  out: NodeJS.WritableStream;
  json: boolean;
}

/**
 * The class mounted for a suite: `takesUnclaimed: false` for the reason `chat` has it — this
 * process holds the agent so that the run reaches THIS class, and a real phone call must not ring
 * in a terminal running a suite. Every golden opens its call in its own state, handed to the
 * instance through mount's own `opening` seam — the moment between the class's onCall and the
 * first render.
 */
export function mountedForASuite(loaded: Loaded, pc: Pinecall): ForASuite {
  const openings = new Openings();
  const mounted = mount(loaded.ctor, {
    ...mountOptions(loaded, pc),
    takesUnclaimed: false,
    opening: (call) => openings.opening(call),
  });
  return { mounted, openings };
}

/**
 * The suite, run and reported: the run asked of the gateway, followed while it happens, the seeds
 * checked against what it opened, every broken golden written out, and the exit code a gate reads.
 * 1 when a golden did not hold or the gateway was busy, whatever else went right.
 */
export async function ranSuite(suite: Suite): Promise<number> {
  const { door, held, goldens, models, out } = suite;
  held.openings.expects(goldens, models.length);
  const declaredAs = declaredBy(suite.loaded.ctor);
  const pending = aRun(door, {
    agent: held.mounted.slug,
    goldens,
    ...(models.length > 0 ? { models } : {}),
    ...(held.mounted.agent.app === undefined ? {} : { app: held.mounted.agent.app }),
    ...suite.line,
  });
  const watched = {
    agent: held.mounted.slug,
    goldens: goldens.length,
    models: models.length > 0 ? models.map((model) => `${model.provider}/${model.model}`) : [declaredAs],
    declaredAs,
  };
  let run: EvalRun;
  try {
    run = await followed(door, watched, pending, out, suite.json);
  } catch (refused) {
    if (!(refused instanceof Refused) || refused.status !== 409) throw refused;
    process.stderr.write(`${await busy(door, held.mounted.slug, refused)}\n`);
    return 1;
  }
  const wrong = held.openings.mismatched(run);
  if (wrong !== undefined) process.stderr.write(`${wrong}\n`);
  return await reported(door, run, goldens, declaredAs, suite.json, out);
}

/** The run printed and answered for: exit 1 when a golden did not hold, whatever else went right. */
async function reported(
  door: Door,
  run: EvalRun,
  goldens: Golden[],
  declaredAs: string,
  asJson: boolean,
  out: NodeJS.WritableStream,
): Promise<number> {
  const logs = await logsOf(door, run);
  const latencies: Latencies = {};
  for (const [call, entries] of Object.entries(logs)) latencies[call] = mediansOf(entries);
  // The logs are already in hand, so a broken golden costs one write and no second round trip.
  const written = writtenOut(run, goldens, logs);
  if (asJson) out.write(`${JSON.stringify({ run, latencies, reproductions: written })}\n`);
  else out.write(`${[...reportOf(run, latencies, declaredAs), ...whereTheyAre(written)].join("\n")}\n`);
  return run.status === "done" && (run.matrix?.failures.length ?? 0) === 0 ? 0 : 1;
}

// Each call's own log, by call id. The runner's matrix carries what the graphs answered and
// `call.summary`; the per-turn metrics entries and every other thing that happened live in the
// log, so the report reads them from there rather than asking anybody to summarise them twice.
async function logsOf(door: Door, run: EvalRun): Promise<Record<string, Entry[]>> {
  const logs: Record<string, Entry[]> = {};
  for (const opened of run.calls) logs[opened.call] = await entriesOf(door, opened.call);
  return logs;
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
