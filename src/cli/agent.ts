/** `pinecall agent`: what the org set over the class — yours, the team's, production's — setting it, and the processes that hold it. */

import { parseArgs } from "node:util";

import type { TuningAnswer, TuningBody } from "@pinecall/protocol";

import { FIELDS, linesOf, readSettings, theCornerToWrite, WIRE, type Field } from "./agent-lines.js";
import { filesRun } from "./agent-files.js";
import { knowledgeRun } from "./agent-knowledge.js";
import { listed, stopped } from "./agent-processes.js";
import { versionsRun } from "./agent-versions.js";
import type { Editor } from "./agent-knowledge.js";
import { theDoor } from "./env.js";
import type { Group } from "./groups.js";
import { agentOfThisDirectory, notASlug } from "./load.js";
import { asked, type Door } from "./testing/gateway.js";
import { SHORT_NAMES, theModelNamed } from "./testing/models.js";
import { refusal } from "./whoami.js";

const USAGE = [
  "usage: pinecall agent [--agent <slug>] [--json]",
  "       pinecall agent list · stop <app>",
  "       pinecall agent set [--voice x] [--tts x] [--tts-model x] [--stt x] [--llm x] [--greeting '…' | --reply '…']",
  "                          [--hangup '…'] [--endpointing-ms n] [--min-interruption-words n] [--record on|off]",
  "                          [--eot-threshold 0.5-0.9] [--eager-eot-threshold 0.3-0.9]",
  "                          [--remember '…' …] [--forget '…' …] [--team] [--note '…']",
  "       pinecall agent knowledge [--team] · knowledge edit [--team] [--note '…']",
  "       pinecall agent clear [voice|tts|tts-model|stt|llm|greeting|hangup|turn|memory|record|knowledge|bases …] [--team]",
  "       pinecall agent history [--team] · diff [--against team|production] · rollback <version> [--team]",
  "       pinecall agent pull [--team] · push <file> [--team]",
].join("\n");

export const group: Group = {
  purpose: "what the org set over the class — yours, the team's, production's — setting it, and the processes that hold it",
  usage: `${USAGE}

  With nothing after it: the agent's settings as your key sees them, three corners side by side —
  your own sandbox corner, the team's, and production's — a row per field, and which version each
  corner is at. A corner that set nothing reads as what it falls back to.

  set writes a NEW version in your own corner: what you set is yours, and a colleague's next call
  does not hear it. --team writes the org's own corner instead, which every corner falls back to.
  --prod writes production's, if your org lets you act there. The whole set travels with the version it was read at, so two people
  saving at once never write over each other: the second is told where the corner is now. A model
  knob reads four ways — \`--llm anthropic/claude-haiku-4-5\`, \`--llm cartesia\` (a vendor, its own
  model), \`--llm claude-haiku-4-5\` (a model, the vendor in use), and \`--llm haiku\` (a tier, which
  is expanded here to the id its provider answers to, as \`pinecall test --model\` expands it). A
  name that means no model at all is refused rather than written. --greeting sets the words said as
  the call opens; --reply what the model reads before it finds its own. --remember and --forget
  replace those lists whole. A field nobody names is left as it stands.

  knowledge is what the agent knows by heart — the business as the org describes it, in Markdown,
  read whole on every call. Alone it prints the corner's text; \`edit\` opens it in $EDITOR and
  saves what you wrote as the next version (an empty file takes it out). It is not the RAG: the
  documents a turn searches are \`pinecall docs\`, attached as \`bases\`.

  clear takes fields out of the corner's own row, so the runtime's default stands for them again;
  with no name, every field. There is no blank value.

  history, diff and rollback are the versions: every one kept, who set it and why; this corner
  against the team's or production's; one version back as the next one — with --prod, production's.
  pull prints the corner's config as JSON; push sends a file as the next version, --team to the
  team's corner.

  list prints every process holding this org's agents in the world asked — one line an app: its id,
  the agents it holds, whose corner, the machine and the address it connected from, the SDK, and
  since when. stop <app> closes that app's socket; a pinecall that hears it exits instead of
  dialling back, so its agents are free — though a supervisor (systemd, pm2) starts it again.`,
  run,
};

// A short name is a tier, not a model: `--llm haiku` was stored as written and the gateway read a
// bare name as the vendor in use, so the corner held `anthropic/haiku` — a 404 at the provider,
// and no call said so. It is expanded HERE, through the one table `pinecall test --model` reads,
// and a name that means no model at all never reaches the corner.
const NOT_A_MODEL = (said: string): string =>
  `--llm ${said} names no model: vendor/model, a vendor alone, a model alone, ` +
  `or one of ${Object.keys(SHORT_NAMES).join(" · ")}`;

// How sure the ears are, which is a confidence and never a count. The gateway holds the two to
// Deepgram's own bands and to each other; this only holds them to being a number between 0 and 1,
// so `--eot-threshold high` is answered here rather than three hops away.
const NOT_A_CONFIDENCE = (flag: string, said: string): string =>
  `--${flag} ${said} is not a confidence: a number above 0 and no higher than 1`;

// Whether the agent's calls keep their audio. Typed as `on|off` and not as a bare flag, because
// `--record` alone could only ever turn it ON and the whole point of the knob is that an org may
// say no. Anything else is answered here, before a door is opened.
const NOT_ON_OR_OFF = (said: string): string => `--record ${said} is not on or off`;

function switched(said: string | undefined): boolean | undefined {
  return said === "on" ? true : said === "off" ? false : undefined;
}

function fraction(said: string | undefined): number | undefined {
  if (said === undefined) return undefined;
  const number = Number(said);
  return Number.isFinite(number) && number > 0 && number <= 1 ? number : undefined;
}

/** What the verb can be told besides the argv: where to print, and which environment. Tests only. */
export interface Setting {
  out?: NodeJS.WritableStream;
  err?: NodeJS.WritableStream;
  env?: NodeJS.ProcessEnv;
  /** What `knowledge edit` opens the text in: $EDITOR, or what a test answers instead. */
  editor?: Editor;
}

/** Every flag the sub-verbs take, declared once: parseArgs is strict, and one table is one seam. */
export const OPTIONS = {
  agent: { type: "string" },
  json: { type: "boolean", default: false },
  team: { type: "boolean", default: false },
  note: { type: "string" },
  voice: { type: "string" },
  tts: { type: "string" },
  "tts-model": { type: "string" },
  stt: { type: "string" },
  llm: { type: "string" },
  greeting: { type: "string" },
  reply: { type: "string" },
  hangup: { type: "string" },
  "endpointing-ms": { type: "string" },
  "eot-threshold": { type: "string" },
  "eager-eot-threshold": { type: "string" },
  "min-interruption-words": { type: "string" },
  record: { type: "string" },
  remember: { type: "string", multiple: true },
  forget: { type: "string", multiple: true },
  against: { type: "string" },
} as const;

export type Typed = ReturnType<typeof parseArgs<{ options: typeof OPTIONS; allowPositionals: true }>>["values"];

export async function run(argv: string[], how: Setting = {}): Promise<number> {
  const out = how.out ?? process.stdout;
  const err = how.err ?? process.stderr;
  const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, options: OPTIONS });
  const llm = values.llm === undefined ? undefined : theModelNamed(values.llm);
  if (values.llm !== undefined && llm === undefined) {
    err.write(`${NOT_A_MODEL(values.llm)}\n`);
    return 2;
  }
  // A confidence that is not one is answered here, beside the model that names nothing: before a
  // door is opened, so nothing is read and nothing is written.
  for (const flag of ["eot-threshold", "eager-eot-threshold"] as const) {
    const said = values[flag];
    if (said !== undefined && fraction(said) === undefined) {
      err.write(`${NOT_A_CONFIDENCE(flag, said)}\n`);
      return 2;
    }
  }
  if (values.record !== undefined && switched(values.record) === undefined) {
    err.write(`${NOT_ON_OR_OFF(values.record)}\n`);
    return 2;
  }
  const door = theDoor(how.env ?? process.env, err);
  if (door === undefined) return 2;
  const [verb, ...rest] = positionals;
  try {
    if (verb === "list") return await listed(door, out);
    if (verb === "stop") return await stopped(door, rest[0], out, err);
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
    if (verb === undefined) return said(agent, await readSettings(door, agent), values.json === true, out);
    if (verb === "set") {
      return said(agent, await set(door, agent, { ...values, ...(llm === undefined ? {} : { llm }) }), values.json === true, out);
    }
    if (verb === "clear") return said(agent, await clear(door, agent, rest, values.team === true), values.json === true, out);
    if (verb === "history" || verb === "diff" || verb === "rollback") {
      return await versionsRun(door, agent, verb, rest, values, out, err);
    }
    if (verb === "pull" || verb === "push") return await filesRun(door, agent, verb, rest, values, out, err);
    if (verb === "knowledge") return await knowledgeRun(door, agent, rest[0], values, out, err, how.editor);
  } catch (refused) {
    // The gateway's own sentence: it knows this build's vendors, the corner's version, and which
    // half of the settings a key opens — and every refusal names the one it was.
    err.write(`${refusal(refused)}\n`);
    return 1;
  }
  err.write(`${USAGE}\n`);
  return 2;
}

// ── the verbs ───────────────────────────────────────────────────────────────────

// The door takes the WHOLE set with the version it was read at, so what this command line did
// not name is read back off the corner's own row and sent again: `set --llm x` must not quietly
// take the voice out of the row. The corner written is yours, or the team's with --team.
async function set(door: Door, agent: string, values: Typed): Promise<TuningAnswer> {
  const corner = await theCornerToWrite(door, agent, values.team === true);
  return await corner.write((config) => ({ ...config, ...typed(values, config) }), values.note ?? null);
}

async function clear(door: Door, agent: string, named: string[], team: boolean): Promise<TuningAnswer> {
  const unknown = named.filter((name) => !(FIELDS as readonly string[]).includes(name));
  if (unknown.length > 0) throw new Error(`no field called ${unknown.join(", ")}: ${FIELDS.join(" · ")}`);
  const corner = await theCornerToWrite(door, agent, team);
  return await corner.write(
    (standing) => {
      const config: TuningBody = named.length === 0 ? {} : { ...standing };
      for (const name of named) delete config[WIRE[name as Field]];
      return config;
    },
    named.length === 0 ? "cleared" : `cleared ${named.join(", ")}`,
  );
}

/** What this command line set, under the wire's names, over what the corner's row already says. */
export function typed(values: Typed, standing: TuningBody): Partial<TuningBody> {
  const wanted: Partial<TuningBody> = {};
  for (const field of ["voice", "tts", "tts-model", "stt", "llm"] as const) {
    const value = values[field];
    if (typeof value === "string") (wanted as Record<string, unknown>)[WIRE[field]] = value;
  }
  if (values.greeting !== undefined) wanted.greeting = { say: values.greeting };
  else if (values.reply !== undefined) wanted.greeting = { reply: values.reply };
  if (values.hangup !== undefined) wanted.hangup = { when: values.hangup };
  const endpointing = numberOf(values["endpointing-ms"]);
  const words = numberOf(values["min-interruption-words"]);
  // How sure a recogniser that ends the turn itself has to be: a fraction, never a whole number,
  // which is why these two are read with a different reader.
  const sure = fraction(values["eot-threshold"]);
  const eager = fraction(values["eager-eot-threshold"]);
  if ([endpointing, words, sure, eager].some((set) => set !== undefined)) {
    wanted.turn = { ...(standing.turn ?? {}) };
    if (endpointing !== undefined) wanted.turn.endpointing_ms = endpointing;
    if (words !== undefined) wanted.turn.min_interruption_words = words;
    if (sure !== undefined) wanted.turn.eot_threshold = sure;
    if (eager !== undefined) wanted.turn.eager_eot_threshold = eager;
  }
  const records = switched(values.record);
  if (records !== undefined) wanted.record = records;
  if (values.remember !== undefined || values.forget !== undefined) {
    wanted.memory = {
      remember: values.remember ?? standing.memory?.remember ?? [],
      forget: values.forget ?? standing.memory?.forget ?? [],
    };
  }
  return wanted;
}

function numberOf(said: string | undefined): number | undefined {
  if (said === undefined) return undefined;
  const number = Number(said);
  if (!Number.isInteger(number) || number < 0) throw new Error(`${said} is not a whole number`);
  return number;
}

function said(agent: string, answer: TuningAnswer, asJson: boolean, out: NodeJS.WritableStream): number {
  out.write(asJson ? `${JSON.stringify(answer)}\n` : `${linesOf(agent, answer).join("\n")}\n`);
  return 0;
}
