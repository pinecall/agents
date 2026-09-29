/** Run a golden suite against the agent class mounted in this process (CLI and console). */

import { type ModelConfig } from "../../wire/agent-config.js";
import { type Camel } from "../../wire/codec.js";
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

// Shown on a 409 (one run per agent at a time).
const BUSY = "a run is already going on {agent} ({id}) — pinecall runs show {id} to watch it";

/** The mounted class and its per-call state seeding. */
export interface ForASuite {
  mounted: Mounted;
  openings: Openings;
}

/** Everything needed to run one suite. */
export interface Suite {
  door: Door;
  loaded: Loaded;
  held: ForASuite;
  goldens: Golden[];
  models: Camel<ModelConfig>[];
  /** Ring 2 fields for a spoken suite; empty for a written one. */
  line: Partial<Wanted>;
  out: NodeJS.WritableStream;
  json: boolean;
}

/**
 * Mount the class for a suite. `takesUnclaimed: false` keeps real calls out of this process; each
 * call's golden state is injected through mount's `opening` seam.
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
 * Run the suite, show progress, check seeding, write reproductions and print the report.
 * @returns Exit code: 1 if any golden failed or the gateway was busy.
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

/** Print the report; returns 1 if any golden failed. */
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
  const written = writtenOut(run, goldens, logs);
  if (asJson) out.write(`${JSON.stringify({ run, latencies, reproductions: written })}\n`);
  else out.write(`${[...reportOf(run, latencies, declaredAs), ...whereTheyAre(written)].join("\n")}\n`);
  return run.status === "done" && (run.matrix?.failures.length ?? 0) === 0 ? 0 : 1;
}

// Each call's log by call id; per-turn metrics are only in the log.
async function logsOf(door: Door, run: EvalRun): Promise<Record<string, Entry[]>> {
  const logs: Record<string, Entry[]> = {};
  for (const opened of run.calls) logs[opened.call] = await entriesOf(door, opened.call);
  return logs;
}

// Look up this agent's running run; the org's newest run may belong to another agent.
async function busy(door: Door, agent: string, refused: Refused): Promise<string> {
  const newest = (await theRuns(door, 1, agent))[0];
  if (newest?.status !== "running") return refused.message;
  return BUSY.replaceAll("{id}", newest.id).replace("{agent}", agent);
}

/** The model name the class declares (`llm`), for display. */
function declaredBy(ctor: new () => Agent): string {
  const declared = (new ctor() as { llm?: unknown }).llm;
  return typeof declared === "string" && declared !== "" ? declared : "the app's own model";
}
