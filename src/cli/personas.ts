/** `pinecall personas`: the synthetic callers of an agent — listed, written, tried, and dropped. */

import { parseArgs } from "node:util";

import { theDoor } from "./env.js";
import type { Group } from "./groups.js";
import { AGENT_FLAG, homeOf, oneHome, type Home } from "./home.js";
import { agentFilesOfTheProject, slugOfAgentFile } from "./load.js";
import { aSimulation, TURNS } from "./simulate.js";
import { personasIn as personasInFiles } from "./testing/caller.js";
import type { Door } from "./testing/gateway.js";
import { dropPersona, NOBODY, personaNamed, personasOf, writePersona, type Persona } from "./testing/personas.js";

const USAGE =
  "usage: pinecall personas [list] | show <name> | try <name>\n" +
  "       pinecall personas add <name> --goal '…' --style '…' [--about '…'] [--fact 'what=said']…\n" +
  "       pinecall personas edit <name> [--goal '…'] [--style '…'] [--about '…'] [--fact 'what=said']… [--rename <name>]\n" +
  "       pinecall personas rm <name> · pinecall personas push [--from test/<agent>/personas]\n" +
  "       … any of them with --agent <name|slug>, --file agent.tsx, --json, and --prod for production's\n";

export const group: Group = {
  purpose: "the agent's synthetic callers: list, show, add, edit, rm, try — kept by the gateway",
  usage: `${USAGE}
  A persona is a caller a model plays: a goal, a style, and the facts they may state about
  themselves. There is no script — every turn is improvised from those three. They are the
  agent's, kept by the gateway beside its settings, so the console shows the same ones and a
  change needs no deploy.

  list             every caller of this agent, with the goal each one pursues
  show <name>      that caller whole, facts and all
  add <name>       write one: --goal and --style are needed, --fact repeated for what they know
  edit <name>      change what is named and leave the rest; --rename moves it to another name
  rm <name>        the caller dropped
  try <name>       one call against the class in this directory — simulate, without the judge
  push             the personas still in files, sent to the gateway once: the migration

  --agent <name|slug>  whose callers: an agent of this project by its name, or a slug of the org
  --file agent.tsx     which class names the agent, when the directory holds more than one
  --json               what the gateway answered — the caller for show, the roster for the rest.
                       try prints a call as it happens and refuses the flag`,
  run,
};

/** Where a verb prints and which environment it reads its door from. Tests hand in their own. */
export interface Setting {
  out?: NodeJS.WritableStream;
  err?: NodeJS.WritableStream;
  env?: NodeJS.ProcessEnv;
}

/** Every verb of the group, so a word nobody wrote is answered before anything is loaded. */
const VERBS = ["list", "show", "add", "edit", "rm", "try", "push"] as const;

// A caller with no facts of their own is not broken — they are somebody who will invent nothing,
// which is what the model playing them is told. `show` says so rather than printing an empty block.
const NO_FACTS = "(no facts: this caller may state nothing about themselves)";

const NONE_YET = (agent: string): string =>
  `${agent} has no personas yet: \`pinecall personas add <name> --goal '…' --style '…'\`, or the console's Personas`;

const FACT_SHAPE = "a fact is what=said: --fact 'their phone=305 555 0101'";

// The gateway's own rule for a caller's name, read here too, because a name it will refuse is
// worth a sentence and not a JSON body: `--persona` takes the same word afterwards.
const A_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const NAME_SHAPE = (name: string): string =>
  `${name} is no name for a caller: lower-case letters and digits joined by hyphens — apurado, price-shopper`;

// `try` holds a live call and prints its turns as they land: there is no answer to print instead,
// so the flag is refused rather than quietly ignored.
const NOT_JSON = "try prints a call as it happens, not an answer the gateway gave: drop --json";

export async function run(argv: string[], how: Setting = {}): Promise<number> {
  const out = how.out ?? process.stdout;
  const err = how.err ?? process.stderr;
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      goal: { type: "string" },
      style: { type: "string" },
      about: { type: "string" },
      fact: { type: "string", multiple: true },
      rename: { type: "string" },
      from: { type: "string" },
      file: { type: "string" },
      json: { type: "boolean", default: false },
      ...AGENT_FLAG,
    },
  });
  const [verb = "list", name] = positionals;
  // Before the class: a word this group does not answer to is a usage line, not a project loaded
  // and a gateway knocked at to find out it was never going to be run.
  if (!(VERBS as readonly string[]).includes(verb)) {
    err.write(USAGE);
    return 2;
  }
  const asJson = values.json === true;
  if (asJson && verb === "try") {
    err.write(`${NOT_JSON}\n`);
    return 2;
  }
  const door = theDoor(how.env ?? process.env, err);
  if (door === undefined) return 2;
  let home: Home | undefined;
  const here = async (): Promise<Home> => (home ??= await oneHome("personas", values.file, values.agent));
  const agent = await theSlug(values.agent, here);

  if (verb === "list") return await listed(door, agent, asJson, out);
  if (verb === "push") return await pushed(door, agent, values.from ?? (await here()).personas, asJson, out, err);
  if (name === undefined) {
    err.write(USAGE);
    return 2;
  }
  if (verb === "show") return await shown(door, agent, name, asJson, out, err);
  if (verb === "rm") return await dropped(door, agent, name, asJson, out, err);
  if (verb === "try") return await tried(door, agent, name, await here(), out, err);
  return await written(door, agent, name, verb === "add" ? "add" : "edit", values, asJson, out, err);
}

/**
 * Whose callers, as the gateway files them: under the agent's SLUG, which is the class's own.
 *
 * `--agent` is the project's name for an agent (`sales`) or a slug of the org (`bidfire-sales`),
 * and the verbs that load a class already read it both ways. A name that is a folder under
 * `agents/` here is resolved through its class — `personas --agent sales` asked for the callers of
 * "sales", which is nobody, while the console showed them under the slug. Anything else is a slug
 * already and travels as typed, so a terminal outside a project still reaches its org's agents.
 */
async function theSlug(named: string | undefined, here: () => Promise<Home>): Promise<string> {
  if (named !== undefined && !agentFilesOfTheProject().some((file) => homeOf(file).name === named)) return named;
  return await slugOfAgentFile((await here()).file);
}

/** One line per caller: the name a verb takes, how they talk, and the goal they pursue. */
async function listed(door: Door, agent: string, asJson: boolean, out: NodeJS.WritableStream): Promise<number> {
  const personas = await personasOf(door, agent);
  if (asJson) {
    out.write(`${JSON.stringify({ personas })}\n`);
    return 0;
  }
  if (personas.length === 0) {
    out.write(`${NONE_YET(agent)}\n`);
    return 0;
  }
  out.write(`${personas.map(oneLine).join("\n")}\n`);
  return 0;
}

/** One caller whole: how they talk, and every fact about themselves they are allowed to state. */
async function shown(
  door: Door,
  agent: string,
  name: string,
  asJson: boolean,
  out: NodeJS.WritableStream,
  err: NodeJS.WritableStream,
): Promise<number> {
  const persona = await personaNamed(door, agent, name);
  if (persona === undefined) {
    err.write(`${NOBODY(name, agent)}\n`);
    return 2;
  }
  out.write(asJson ? `${JSON.stringify(persona)}\n` : `${linesOf(persona).join("\n")}\n`);
  return 0;
}

// `add` writes a whole caller and `edit` writes the one there with what was named changed: both
// are one PUT, because the gateway keeps a caller whole and merging belongs on this side.
async function written(
  door: Door,
  agent: string,
  name: string,
  verb: "add" | "edit",
  values: { goal?: string; style?: string; about?: string; fact?: string[]; rename?: string },
  asJson: boolean,
  out: NodeJS.WritableStream,
  err: NodeJS.WritableStream,
): Promise<number> {
  const before = await personaNamed(door, agent, name);
  if (verb === "edit" && before === undefined) {
    err.write(`${NOBODY(name, agent)}\n`);
    return 2;
  }
  if (verb === "add" && before !== undefined) {
    err.write(`${agent} has a persona called ${name} already: \`pinecall personas edit ${name}\`\n`);
    return 2;
  }
  const writing = values.rename ?? name;
  if (!A_NAME.test(writing)) {
    err.write(`${NAME_SHAPE(writing)}\n`);
    return 2;
  }
  const goal = values.goal ?? before?.goal;
  const style = values.style ?? before?.style;
  if (goal === undefined || style === undefined) {
    err.write("a persona needs --goal and --style: what they want, and how they talk\n");
    return 2;
  }
  let facts: Record<string, string>;
  try {
    facts = values.fact === undefined ? (before?.facts ?? {}) : theFacts(values.fact);
  } catch (refused) {
    err.write(`${refused instanceof Error ? refused.message : String(refused)}\n`);
    return 2;
  }
  const kept = await writePersona(door, agent, writing, {
    goal,
    style,
    about: values.about ?? before?.about ?? "",
    facts,
    state: before?.state ?? {},
    ...(writing === name ? {} : { was: name }),
  });
  if (asJson) {
    out.write(`${JSON.stringify({ personas: kept })}\n`);
    return 0;
  }
  const now = kept.find((one) => one.name === writing);
  out.write(`${agent} · ${now?.name ?? name} ${verb === "add" ? "written" : "changed"} · ${kept.length} persona(s)\n`);
  return 0;
}

// A caller nobody wrote is the same sentence here as everywhere else: the gateway answers a
// DELETE of a name it does not hold with its own JSON, which is no answer for a person.
async function dropped(
  door: Door,
  agent: string,
  name: string,
  asJson: boolean,
  out: NodeJS.WritableStream,
  err: NodeJS.WritableStream,
): Promise<number> {
  if ((await personaNamed(door, agent, name)) === undefined) {
    err.write(`${NOBODY(name, agent)}\n`);
    return 2;
  }
  const kept = await dropPersona(door, agent, name);
  out.write(asJson ? `${JSON.stringify({ personas: kept })}\n` : `${agent} · ${name} dropped · ${kept.length} persona(s)\n`);
  return 0;
}

// `try` runs the caller against the class, because reading a persona tells you who they are and
// only a call tells you how they land. It is `simulate` without the judge — one implementation.
async function tried(
  door: Door,
  agent: string,
  name: string,
  home: Home,
  out: NodeJS.WritableStream,
  err: NodeJS.WritableStream,
): Promise<number> {
  const persona = await personaNamed(door, agent, name);
  if (persona === undefined) {
    err.write(`${NOBODY(name, agent)}\n`);
    return 2;
  }
  const said = await aSimulation(persona, { door, agentFile: home.file, judge: false, voice: false, turns: TURNS, out });
  return said === undefined ? 2 : 0;
}

/**
 * The migration, run once per project: the personas still written as files are sent to the
 * gateway, where the console and every terminal read the same ones. A file that computes its
 * state — a client out of `lib/` — is evaluated here, so what lands is the value it produced.
 * The files are yours to delete afterwards; this verb never touches them.
 */
async function pushed(
  door: Door,
  agent: string,
  folder: string,
  asJson: boolean,
  out: NodeJS.WritableStream,
  err: NodeJS.WritableStream,
): Promise<number> {
  const inFiles = await personasInFiles(folder);
  if (inFiles.length === 0) {
    err.write(`no personas in ${folder}\n`);
    return 2;
  }
  const landed: string[] = [];
  let kept: Persona[] = [];
  for (const persona of inFiles) {
    try {
      kept = await writePersona(door, agent, persona.name, {
        goal: persona.goal,
        style: persona.style,
        about: "",
        facts: Object.fromEntries(Object.entries(persona.facts ?? {}).map(([what, said]) => [what, String(said)])),
        state: persona.state ?? {},
      });
    } catch (refused) {
      // Half a migration is the one thing this verb must never leave in silence: a second run has
      // to know which callers are already the gateway's and which are still only files.
      err.write(`${halfWay(agent, landed, inFiles.map((one) => one.name).slice(landed.length), refused)}\n`);
      return 2;
    }
    landed.push(persona.name);
    if (!asJson) out.write(`  ${persona.name}\n`);
  }
  out.write(asJson ? `${JSON.stringify({ personas: kept })}\n` : `${agent} · ${landed.length} persona(s) pushed from ${folder}\n`);
  return 0;
}

/** What a push that stopped says: what the gateway now holds, what it does not, and why it stopped. */
function halfWay(agent: string, landed: string[], left: string[], refused: unknown): string {
  return [
    `${agent} · ${left[0]} was refused: ${refused instanceof Error ? refused.message : String(refused)}`,
    `  pushed: ${landed.length === 0 ? "nothing" : landed.join(", ")}`,
    `  still only files: ${left.join(", ")}`,
    "  nothing was undone and no file was touched: push again once it is fixed",
  ].join("\n");
}

/** `--fact 'their phone=305 555 0101'`, repeated: what this caller knows about themselves. */
function theFacts(said: string[]): Record<string, string> {
  const facts: Record<string, string> = {};
  for (const one of said) {
    const at = one.indexOf("=");
    if (at <= 0) throw new Error(FACT_SHAPE);
    facts[one.slice(0, at).trim()] = one.slice(at + 1).trim();
  }
  return facts;
}

/** The lines `show` prints: the caller, the goal, the style, and every fact they may state. */
function linesOf(persona: Persona): string[] {
  const facts = Object.entries(persona.facts);
  return [
    `${persona.name} · ${persona.goal}`,
    ...(persona.about === "" ? [] : [`  ${persona.about}`]),
    `  ${persona.style}`,
    ...(facts.length === 0 ? [`  ${NO_FACTS}`] : facts.map(([what, said]) => `  ${what}: ${said}`)),
  ];
}

function oneLine(persona: Persona): string {
  return `${persona.name.padEnd(12)}  ${persona.style.padEnd(46)}  ${persona.goal}`;
}
