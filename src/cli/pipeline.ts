/** `pinecall pipeline`: what an agent hears, decides and speaks with, and the knobs an operator turns. */

import { parseArgs } from "node:util";

import { theDoor } from "./env.js";
import type { Group } from "./groups.js";
import { agentOfThisDirectory, notASlug } from "./load.js";
import { asked, type Door } from "./testing/gateway.js";
import { refusal } from "./whoami.js";

const USAGE = [
  "usage: pinecall pipeline [--agent <slug>] [--json]",
  "       pinecall pipeline set [--stt x] [--llm x] [--tts x] [--voice x] [--tts-model x] [--greeting '…']",
  "       pinecall pipeline clear [stt|llm|tts|voice|tts-model|greeting …]",
].join("\n");

export const group: Group = {
  purpose: "what the agent hears, decides and speaks with, and the six knobs an operator turns",
  usage: `${USAGE}

  With nothing after it: the three legs of the pipeline as the NEXT call would be built — the
  vendor, the model and the one knob worth showing — what the class declared as its opening, the
  medians livekit measured over the agent's recent calls, and which of the six knobs is turned.

  set turns a knob for every call from the next one, held by the gateway and not by a deploy. A
  model knob reads three ways: \`--llm anthropic/claude-haiku-4-5\` names both, \`--llm cartesia\`
  names a VENDOR and keeps that vendor's own default model, and \`--llm claude-haiku-4-5\` keeps
  whichever vendor is in use. \`--tts\` is the vendor that speaks, and the voice beside it is then
  that vendor's own id. A knob nobody names here is left exactly as it stands.

  clear gives a knob back to what the app declared. With no name it gives back all six. There is
  no blank value: an empty voice once silenced a whole line of calls, and the door refuses one.

  \`pinecall providers\` lists every vendor a knob may name and what each one still wants; the same
  six knobs are the console's Pipeline screen, over the same two doors.`,
  run,
};

/** One leg of the three: which vendor runs it, which model, and the one knob worth showing. */
interface Stage {
  vendor: string;
  model: string | null;
  voice_id: string | null;
  language: string | null;
}

/** The six knobs. A knob left out of a PUT is not overridden at all. */
interface Overridden {
  voice: string | null;
  tts: string | null;
  tts_model: string | null;
  stt: string | null;
  llm: string | null;
  greeting: string | null;
}

/** One latency over the agent's recent calls, under livekit's own name for it. */
interface Measured {
  name: string;
  seconds: number;
  turns: number;
}

/** What the pipeline door answers: the legs, the opening, what is turned, and what it cost. */
interface Report {
  agent: string;
  hears: Stage;
  decides: Stage;
  speaks: Stage;
  greeting: { say: string | null; reply: string | null } | null;
  overrides: Overridden;
  voices: string[];
  calls: number;
  medians: Measured[];
  unavailable_reasons: Record<string, string>;
}

/** The knob as it is typed, and the knob as the wire carries it. One table, both directions. */
const KNOBS: Record<string, keyof Overridden> = {
  stt: "stt",
  llm: "llm",
  tts: "tts",
  voice: "voice",
  "tts-model": "tts_model",
  greeting: "greeting",
};

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
  const door = theDoor(how.env ?? process.env, err);
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
    if (verb === "set") return said(await turned(door, agent, asKnobs(values)), values.json === true, out);
    if (verb === "clear") return said(await cleared(door, agent, named), values.json === true, out);
  } catch (refused) {
    // The gateway's own sentence: it is the one that knows this build's vendors and this build's
    // voices, and a knob refused here says which of the six it was and what it may be.
    err.write(`${refusal(refused)}\n`);
    return 1;
  }
  err.write(`${USAGE}\n`);
  return 2;
}

// ── the two doors ───────────────────────────────────────────────────────────────

async function read(door: Door, agent: string): Promise<Report> {
  return await asked<Report>(door, `${pathFor(agent)}`);
}

// The door takes the WHOLE set, so a knob nobody named on this command line is read back and sent
// again: `set --llm x` twice in a row must not quietly give the voice back to the class.
async function turned(door: Door, agent: string, wanted: Partial<Overridden>): Promise<Report> {
  const standing = (await read(door, agent)).overrides;
  return await asked<Report>(door, `${pathFor(agent)}/overrides`, {
    method: "PUT",
    body: { ...held(standing), ...wanted },
  });
}

async function cleared(door: Door, agent: string, named: string[]): Promise<Report> {
  const unknown = named.filter((name) => KNOBS[name] === undefined);
  if (unknown.length > 0) throw new Error(`no knob called ${unknown.join(", ")}: ${Object.keys(KNOBS).join(" · ")}`);
  // No name at all is every knob at once: the whole set left out is how the door says "as declared".
  if (named.length === 0) return await asked<Report>(door, `${pathFor(agent)}/overrides`, { method: "PUT", body: {} });
  const keeping = held((await read(door, agent)).overrides);
  for (const name of named) delete keeping[KNOBS[name]!];
  return await asked<Report>(door, `${pathFor(agent)}/overrides`, { method: "PUT", body: keeping });
}

/** What is turned right now, as a body the door takes: a knob nobody turned is not a field at all. */
function held(standing: Overridden): Partial<Record<keyof Overridden, string>> {
  const body: Partial<Record<keyof Overridden, string>> = {};
  for (const knob of Object.values(KNOBS)) {
    const value = standing[knob];
    if (typeof value === "string" && value !== "") body[knob] = value;
  }
  return body;
}

/** The knobs this command line named, under the names the wire uses. */
function asKnobs(values: Record<string, unknown>): Partial<Overridden> {
  const wanted: Partial<Overridden> = {};
  for (const [typed, knob] of Object.entries(KNOBS)) {
    const value = values[typed];
    if (typeof value === "string") wanted[knob] = value;
  }
  return wanted;
}

function pathFor(agent: string): string {
  return `/v1/agents/${encodeURIComponent(agent)}/pipeline`;
}

// ── what a person reads ─────────────────────────────────────────────────────────

function said(report: Report, asJson: boolean, out: NodeJS.WritableStream): number {
  out.write(asJson ? `${JSON.stringify(report)}\n` : `${linesOf(report).join("\n")}\n`);
  return 0;
}

/** The whole screen as a page of text: the three legs, the opening, the medians, what is turned. */
export function linesOf(report: Report): string[] {
  const calls = `${report.calls} call${report.calls === 1 ? "" : "s"}`;
  const lines = [`${report.agent} · ${calls}`, ""];
  lines.push(`  hears     ${stageLine(report.hears)}${turnedAt(report, "stt")}`);
  lines.push(`  decides   ${stageLine(report.decides)}${turnedAt(report, "llm")}`);
  lines.push(`  speaks    ${stageLine(report.speaks)}${turnedAt(report, "tts", "voice", "tts_model")}`);
  const opening = openingLine(report);
  if (opening !== "") lines.push("", `  greeting  ${opening}${turnedAt(report, "greeting")}`);
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

/** The opening the next call is built with: the words, or that the class improvises them. */
function openingLine(report: Report): string {
  const greeting = report.greeting;
  if (greeting === null) return "";
  if (greeting.say !== null && greeting.say !== "") return `"${greeting.say}"`;
  return `the class improvises: ${greeting.reply ?? ""}`;
}

// A turned knob is marked where it shows, and never silently: an operator reading this page has to
// be able to tell what the app declared from what somebody turned last night.
function turnedAt(report: Report, ...knobs: (keyof Overridden)[]): string {
  const turned = knobs.filter((knob) => typeof report.overrides[knob] === "string" && report.overrides[knob] !== "");
  return turned.length === 0 ? "" : `   ← turned: ${turned.join(", ")}`;
}
