/** `pinecall remember [paths]`: the goldens `memory.remember` is held to — what a call teaches, and what it must never keep. */

import { existsSync } from "node:fs";
import { parseArgs } from "node:util";

import type { ExtractionGolden, ExtractionRun } from "@pinecall/protocol";

import { pinecallFor } from "./client-for.js";

import { mount } from "../runtime/connect.js";
import { theDoor } from "./env.js";
import type { Group } from "./groups.js";
import { load, mountOptions } from "./load.js";
import { AGENT_FLAG, oneHome } from "./home.js";
import { asked, type Door } from "./testing/gateway.js";
import { casesIn, matching } from "./testing/goldens.js";
import { BROKEN, HELD } from "./testing/score.js";
import { refusal } from "./whoami.js";

/**
 * Where the extraction goldens live. `test/goldens` is the conversation ring and its files are a
 * different shape, so these get a directory of their own rather than a key inside a crowded one.
 */
export const CASES = "test/<name>/memory";

export const NO_CASES = `no extraction goldens at ${CASES}: write one, or name the file or directory to run`;

const USAGE = "usage: pinecall remember [paths] [--agent <name>] [--file agent.tsx] [--grep x] [--json]";

export const group: Group = {
  purpose: "the goldens memory.remember is held to: what a call teaches, and what it never keeps",
  usage: `${USAGE}

  A case is one call written down — both speakers, because nothing is re-run — the facts memory
  already holds, and what must come of it: which categories got a fact, which never did, which
  values must not survive in any fact's text, and which held facts the call contradicted.

  Each case costs ONE model call, the very one a hang-up makes, run by the gateway on the org's
  own keys against the class this terminal is holding. Every answer is judged by code: a category
  is the class's own word, a value is a literal, a supersession is an id — never one sentence
  compared to another, because two ways of writing one fact are one fact.`,
  run,
};

/** What the verb can be told besides the argv: where to print, and which environment. Tests only. */
export interface Running {
  out?: NodeJS.WritableStream;
  err?: NodeJS.WritableStream;
  env?: NodeJS.ProcessEnv;
}

/**
 * The class is mounted HERE, exactly as `pinecall test` mounts it, because the categories a golden
 * may name and the tool names admission refuses a fact for are the class's OWN declaration — the
 * gateway reads it off the socket this process opens. The extraction itself runs there: the org's
 * model and the org's provider keys are the gateway's and never this terminal's.
 */
export async function run(argv: string[], how: Running = {}): Promise<number> {
  const out = how.out ?? process.stdout;
  const err = how.err ?? process.stderr;
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      file: { type: "string" },
      ...AGENT_FLAG,
      grep: { type: "string" },
      json: { type: "boolean", default: false },
    },
  });
  const door = await theDoor(how.env ?? process.env, err);
  if (door === undefined) return 2;
  // The agent's home says where its cases are; a directory with no agent at all is told where a
  // case belongs, before any class is looked for.
  const home = await oneHome("remember", values.file, values.agent).catch(() => undefined);
  const folder = home?.memoryCases ?? CASES;
  const paths = positionals.length > 0 ? positionals : [folder];
  if (positionals.length === 0 && !existsSync(folder)) {
    err.write(`${home === undefined ? NO_CASES : NO_CASES.replace(CASES, folder)}\n${USAGE}\n`);
    return 2;
  }
  const cases = matching(await casesIn<ExtractionGolden>(paths, CASES), values.grep);
  if (cases.length === 0) {
    err.write(`no case matched${values.grep === undefined ? "" : ` --grep ${values.grep}`}\n`);
    return 2;
  }
  const loaded = await load(home?.file ?? values.file);
  const pc = pinecallFor(door);
  // takesUnclaimed: false for the reason `test` has it: this process holds the agent so the run
  // reaches THIS class, and a real call must not ring in a terminal running a suite.
  const mounted = mount(loaded.ctor, { ...mountOptions(loaded, pc), takesUnclaimed: false });
  try {
    await pc.connect();
    const answer = await extracted(door, mounted.slug, cases);
    out.write(values.json === true ? `${JSON.stringify(answer)}\n` : `${linesOf(answer).join("\n")}\n`);
    return answer.held === answer.cases ? 0 : 1;
  } catch (refused) {
    err.write(`${refusal(refused)}\n`);
    return 1;
  } finally {
    pc.close();
  }
}

/** The one door: every case through one extraction each, judged by code where the model lives. */
export async function extracted(door: Door, agent: string, cases: ExtractionGolden[]): Promise<ExtractionRun> {
  return await asked<ExtractionRun>(door, `/v1/agents/${encodeURIComponent(agent)}/memory/extraction`, {
    method: "POST",
    body: { cases },
  });
}

/** The run as a person reads it: one line, then the evidence under the cases that did not hold. */
export function linesOf(answer: ExtractionRun): string[] {
  const counted = `${answer.cases} case${answer.cases === 1 ? "" : "s"}`;
  const lines = [
    `${answer.agent} · ${answer.model} · ${counted} · ${answer.held} held · ${Math.round(answer.took_ms)} ms`,
  ];
  for (const result of answer.results) {
    if (result.held) {
      lines.push(`  ${HELD} ${result.name}`);
      continue;
    }
    const broke = result.broke ?? [];
    const width = Math.max(...broke.map((one) => one.check.length));
    lines.push(`  ${BROKEN} ${result.name}`);
    for (const one of broke) lines.push(`      ${one.check.padEnd(width)}  ${one.detail}`);
    for (const wrote of result.wrote ?? []) lines.push(`      kept      ${wrote}`);
    for (const refused of result.refused ?? []) lines.push(`      refused   ${refused}`);
  }
  return lines;
}
