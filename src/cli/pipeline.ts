/** `pinecall pipeline`: what an agent hears, decides and speaks with, as the next call would be built. */

import { parseArgs } from "node:util";

import { theDoor } from "./env.js";
import type { Group } from "./groups.js";
import { agentOfThisDirectory, notASlug } from "./load.js";
import { asked, type Door } from "./testing/gateway.js";
import { refusal } from "./whoami.js";

const USAGE = "usage: pinecall pipeline [--agent <slug>] [--json]";

/** Where the six knobs went: the settings verb, which sets the whole of them per corner. */
export const MOVED = "pipeline {verb} moved: the six knobs are the agent's settings now — pinecall agent {verb}";

export const group: Group = {
  purpose: "what the agent hears, decides and speaks with, as the next call would be built",
  usage: `${USAGE}

  The three legs of the pipeline as the NEXT call would be built — the vendor, the model and the
  one knob worth showing — the opening, and the medians livekit measured over the agent's recent
  calls.

  Setting them is \`pinecall agent set\`: the six are fields of the agent's settings now, with the
  opening, the cut of a turn, what is remembered and the bases beside them, per corner and
  versioned. \`pinecall providers\` lists every vendor a stage may be moved onto.`,
  run,
};

/** One leg of the three: which vendor runs it, which model, and the one knob worth showing. */
interface Stage {
  vendor: string;
  model: string | null;
  voice_id: string | null;
  language: string | null;
}

/** One latency over the agent's recent calls, under livekit's own name for it. */
interface Measured {
  name: string;
  seconds: number;
  turns: number;
}

/** What the pipeline door answers: the legs, the opening, and what it cost. */
interface Report {
  agent: string;
  hears: Stage;
  decides: Stage;
  speaks: Stage;
  greeting: { say: string | null; reply: string | null } | null;
  voices: string[];
  calls: number;
  medians: Measured[];
  unavailable_reasons: Record<string, string>;
}

/** What the verb can be told besides the argv: where to print, and which environment. Tests only. */
export interface Turning {
  out?: NodeJS.WritableStream;
  err?: NodeJS.WritableStream;
  env?: NodeJS.ProcessEnv;
}

export async function run(argv: string[], how: Turning = {}): Promise<number> {
  const out = how.out ?? process.stdout;
  const err = how.err ?? process.stderr;
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      agent: { type: "string" },
      json: { type: "boolean", default: false },
      stt: { type: "string" },
      llm: { type: "string" },
      tts: { type: "string" },
      voice: { type: "string" },
      "tts-model": { type: "string" },
      greeting: { type: "string" },
    },
  });
  const door = await theDoor(how.env ?? process.env, err);
  if (door === undefined) return 2;
  const aFile = notASlug(values.agent);
  if (aFile !== undefined) {
    err.write(`${aFile}\n`);
    return 2;
  }
  const agent = values.agent ?? (await agentOfThisDirectory());
  if (agent === null || agent === undefined) {
    err.write(`${USAGE}\n  name the agent, or run this beside an agent file\n`);
    return 2;
  }
  const [verb, ...named] = positionals;
  try {
    if (verb === undefined) return said(await read(door, agent), values.json === true, out);
    // The six knobs are fields of the agent's settings now, with the rest of them: one verb sets
    // the whole of it, per corner and versioned, and this one only reads.
    if (verb === "set" || verb === "clear") {
      err.write(`${MOVED.replaceAll("{verb}", verb)}${named.length === 0 ? "" : ` ${named.join(" ")}`}\n`);
      return 2;
    }
  } catch (refused) {
    // The gateway's own sentence: it is the one that knows this build's vendors and this build's
    // voices, and a knob refused here says which of the six it was and what it may be.
    err.write(`${refusal(refused)}\n`);
    return 1;
  }
  err.write(`${USAGE}\n`);
  return 2;
}

// ── the one door ────────────────────────────────────────────────────────────────

async function read(door: Door, agent: string): Promise<Report> {
  return await asked<Report>(door, `${pathFor(agent)}`);
}

function pathFor(agent: string): string {
  return `/v1/agents/${encodeURIComponent(agent)}/pipeline`;
}

// ── what a person reads ─────────────────────────────────────────────────────────

function said(report: Report, asJson: boolean, out: NodeJS.WritableStream): number {
  out.write(asJson ? `${JSON.stringify(report)}\n` : `${linesOf(report).join("\n")}\n`);
  return 0;
}

/** The whole screen as a page of text: the three legs, the opening, the medians. */
export function linesOf(report: Report): string[] {
  const calls = `${report.calls} call${report.calls === 1 ? "" : "s"}`;
  const lines = [`${report.agent} · ${calls}`, ""];
  lines.push(`  hears     ${stageLine(report.hears)}`);
  lines.push(`  decides   ${stageLine(report.decides)}`);
  lines.push(`  speaks    ${stageLine(report.speaks)}`);
  const opening = openingLine(report);
  if (opening !== "") lines.push("", `  greeting  ${opening}`);
  if (report.medians.length > 0) {
    lines.push("", `  ${report.medians.map((one) => `${one.name} ${one.seconds.toFixed(2)}s`).join(" · ")}`);
  }
  const off = Object.entries(report.unavailable_reasons);
  if (off.length > 0) {
    lines.push("");
    for (const [vendor, why] of off) lines.push(`  ${vendor} is not available here: ${why}`);
  }
  return lines;
}

/** One leg on one line: the vendor, then whichever of the model, the voice and the language it has. */
function stageLine(stage: Stage): string {
  const said = [stage.vendor, stage.model, stage.voice_id, stage.language];
  return said.filter((word): word is string => typeof word === "string" && word !== "").join(" · ");
}

/** The opening the next call is built with: the words, or that the model improvises them. */
function openingLine(report: Report): string {
  const greeting = report.greeting;
  if (greeting === null) return "";
  if (greeting.say !== null && greeting.say !== "") return `"${greeting.say}"`;
  return `the model improvises: ${greeting.reply ?? ""}`;
}
