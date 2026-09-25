/** `pinecall personas`: the synthetic callers of an agent — listed, written, tried, and dropped. */

import { parseArgs } from "node:util";

import { theDoor } from "./env.js";
import type { Group } from "./groups.js";
import { AGENT_FLAG, homeOf, oneHome, type Home } from "./home.js";
import { agentFilesOfTheProject, slugOfAgentFile } from "./load.js";
import { asATable, linesOf, theFacts } from "./persona-lines.js";
import { aSimulation, TURNS } from "./simulate.js";
import { NOT_A_MODEL, theModelNamed } from "./testing/models.js";
import { personasIn as personasInFiles } from "./testing/caller.js";
import type { Door } from "./testing/gateway.js";
import { dropPersona, NOBODY, personaNamed, personasOf, writePersona, type Persona } from "./testing/personas.js";

const USAGE =
  "usage: pinecall personas [list] | show <name> | try <name>\n" +
  "       pinecall personas add <name> --goal '…' --style '…' [--about '…'] [--fact 'what=said']…\n" +
  "       pinecall personas edit <name> [--goal '…'] [--style '…'] [--about '…'] [--fact 'what=said']… [--rename <name>]\n" +
  "       … add and edit also take [--llm x] [--tts x] [--voice x] [--accepts-when '…'] [--declines-when '…']\n" +
  "       pinecall personas rm <name> · pinecall personas push [--from test/<agent>/personas]\n" +
  "       … any of them with --json, and --prod for production's; try and push also take\n" +
  "       --agent <name|slug> or --file agent.tsx, because those two need the class\n";

export const group: Group = {
  purpose: "the org's synthetic callers: list, show, add, edit, rm, try — kept by the gateway",
  usage: `${USAGE}
  A persona is a caller a model plays: a goal, a style, and the facts they may state about
  themselves. There is no script — every turn is improvised from those three. They are the ORG's,
  kept by the gateway — one list, whichever agent picks up — so the console shows the same ones
  and a change needs no deploy.

  list             every caller this org wrote, with the goal each one pursues
  show <name>      that caller whole, facts and all
  add <name>       write one: --goal and --style are needed, --fact repeated for what they know
  edit <name>      change what is named and leave the rest; --rename moves it to another name
  rm <name>        the caller dropped
  try <name>       one call against the class in this directory — simulate, without the judge
  push             the personas still in files, sent to the gateway once: the migration

  --llm x              the model that plays them, as \`agent set --llm\` takes it; --tts and
                       --voice the vendor and the voice their lines are read in. Unset, the
                       runtime's: its default model, a voice the agent does not have
  --accepts-when '…'   when they hang up satisfied, and --declines-when when not: a judge named
                       persona reads every call of theirs against it at hang-up. '' clears one
  --agent <name|slug>  which agent try calls, and which project's files push sends: an agent of
                       this project by its name. The other verbs name no agent at all
  --file agent.tsx     which class, when the directory holds more than one. try and push only
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

const NONE_YET = `this org has no personas yet: \`pinecall personas add <name> --goal '…' --style '…'\`, or the console's Personas`;

// The gateway's own rule for a caller's name, read here too, because a name it will refuse is
// worth a sentence and not a JSON body: `--persona` takes the same word afterwards.
const A_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const NAME_SHAPE = (name: string): string =>
  `${name} is no name for a caller: lower-case letters and digits joined by hyphens — apurado, price-shopper`;

// `try` holds a live call and prints its turns as they land: there is no answer to print instead,
// so the flag is refused rather than quietly ignored.
// `--agent` and `--file` name the CLASS, and only two of these verbs have one to name. On the
// other five they were parsed and dropped, so `personas list --agent whoever` answered the whole
// org's roster with exit 0 — a flag that looks like it filtered and never did. Refused by name,
// with where it does belong.
const NOT_THIS_VERB = (verb: string, flag: string) =>
  `${flag} is for \`personas try\` and \`personas push\`, the two that need the class: ` +
  `\`personas ${verb}\` names no agent, because a caller is the org's`;

const NOT_JSON = "try prints a call as it happens, not an answer the gateway gave: drop --json";

/** What `add` and `edit` were told on the command line: the caller's words, knobs and rule. */
interface Asked {
  goal?: string;
  style?: string;
  about?: string;
  fact?: string[];
  rename?: string;
  llm?: string;
  tts?: string;
  voice?: string;
  "accepts-when"?: string;
  "declines-when"?: string;
}

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
      llm: { type: "string" },
      tts: { type: "string" },
      voice: { type: "string" },
      "accepts-when": { type: "string" },
      "declines-when": { type: "string" },
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
  const door = await theDoor(how.env ?? process.env, err);
  if (door === undefined) return 2;
  let home: Home | undefined;
  // The class is loaded only by the verbs that need one: a caller is the ORG's, so listing,
  // writing and dropping name no agent at all. `--agent` is for `try`, which puts the caller on a
  // class, and for `push`, which reads the files one project wrote under `test/<agent>/personas`.
  const here = async (): Promise<Home> => (home ??= await oneHome("personas", values.file, values.agent));

  // The shape of the command first: a verb that takes a name and was given none is a usage line.
  if (name === undefined && verb !== "list" && verb !== "push") {
    err.write(USAGE);
    return 2;
  }
  // Then a flag that belongs to another verb. `--agent` and `--file` name the CLASS, and only
  // `try` and `push` have one to name; on the rest they were parsed and dropped, so
  // `personas list --agent whoever` answered the whole org's roster with exit 0.
  const named = values.agent !== undefined ? "--agent" : values.file !== undefined ? "--file" : null;
  if (named !== null && verb !== "try" && verb !== "push") {
    err.write(`${NOT_THIS_VERB(verb, named)}\n`);
    return 2;
  }
  if (verb === "list") return await listed(door, asJson, out);
  if (verb === "push") return await pushed(door, values.from ?? (await here()).personas, asJson, out, err);
  if (name === undefined) {
    err.write(USAGE);
    return 2;
  }
  if (verb === "show") return await shown(door, name, asJson, out, err);
  if (verb === "rm") return await dropped(door, name, asJson, out, err);
  if (verb === "try") return await tried(door, name, await here(), out, err);
  return await written(door, name, verb === "add" ? "add" : "edit", values, asJson, out, err);
}

/** One line per caller: the name a verb takes, how they talk, and the goal they pursue. */
async function listed(door: Door, asJson: boolean, out: NodeJS.WritableStream): Promise<number> {
  const personas = await personasOf(door);
  if (asJson) {
    out.write(`${JSON.stringify({ personas })}\n`);
    return 0;
  }
  if (personas.length === 0) {
    out.write(`${NONE_YET}\n`);
    return 0;
  }
  out.write(`${asATable(personas).join("\n")}\n`);
  return 0;
}

/** One caller whole: how they talk, and every fact about themselves they are allowed to state. */
async function shown(
  door: Door,
  name: string,
  asJson: boolean,
  out: NodeJS.WritableStream,
  err: NodeJS.WritableStream,
): Promise<number> {
  const persona = await personaNamed(door, name);
  if (persona === undefined) {
    err.write(`${NOBODY(name)}\n`);
    return 2;
  }
  out.write(asJson ? `${JSON.stringify(persona)}\n` : `${linesOf(persona).join("\n")}\n`);
  return 0;
}

// `add` writes a whole caller and `edit` writes the one there with what was named changed: both
// are one PUT, because the gateway keeps a caller whole and merging belongs on this side.
async function written(
  door: Door,
  name: string,
  verb: "add" | "edit",
  values: Asked,
  asJson: boolean,
  out: NodeJS.WritableStream,
  err: NodeJS.WritableStream,
): Promise<number> {
  const before = await personaNamed(door, name);
  if (verb === "edit" && before === undefined) {
    err.write(`${NOBODY(name)}\n`);
    return 2;
  }
  if (verb === "add" && before !== undefined) {
    err.write(`this org has a persona called ${name} already: \`pinecall personas edit ${name}\`\n`);
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
  const llm = values.llm === undefined || values.llm === "" ? values.llm : theModelNamed(values.llm);
  if (llm === undefined && values.llm !== undefined) {
    err.write(`${NOT_A_MODEL(values.llm)}\n`);
    return 2;
  }
  const kept = await writePersona(door, writing, {
    goal,
    style,
    about: values.about ?? before?.about ?? "",
    facts,
    state: before?.state ?? {},
    // What was not named stays what it was; '' clears it back to the runtime's choice.
    llm: llm ?? before?.llm ?? null,
    tts: values.tts ?? before?.tts ?? null,
    voice: values.voice ?? before?.voice ?? null,
    accepts_when: values["accepts-when"] ?? before?.accepts_when ?? "",
    declines_when: values["declines-when"] ?? before?.declines_when ?? "",
    ...(writing === name ? {} : { was: name }),
  });
  if (asJson) {
    out.write(`${JSON.stringify({ personas: kept })}\n`);
    return 0;
  }
  const now = kept.find((one) => one.name === writing);
  out.write(`${now?.name ?? name} ${verb === "add" ? "written" : "changed"} · ${kept.length} persona(s)\n`);
  return 0;
}

// A caller nobody wrote is the same sentence here as everywhere else: the gateway answers a
// DELETE of a name it does not hold with its own JSON, which is no answer for a person.
async function dropped(
  door: Door,
  name: string,
  asJson: boolean,
  out: NodeJS.WritableStream,
  err: NodeJS.WritableStream,
): Promise<number> {
  if ((await personaNamed(door, name)) === undefined) {
    err.write(`${NOBODY(name)}\n`);
    return 2;
  }
  const kept = await dropPersona(door, name);
  out.write(asJson ? `${JSON.stringify({ personas: kept })}\n` : `${name} dropped · ${kept.length} persona(s)\n`);
  return 0;
}

// `try` runs the caller against the class, because reading a persona tells you who they are and
// only a call tells you how they land. It is `simulate` without the judge — one implementation.
async function tried(
  door: Door,
  name: string,
  home: Home,
  out: NodeJS.WritableStream,
  err: NodeJS.WritableStream,
): Promise<number> {
  const persona = await personaNamed(door, name);
  if (persona === undefined) {
    err.write(`${NOBODY(name)}\n`);
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
      kept = await writePersona(door, persona.name, {
        goal: persona.goal,
        style: persona.style,
        about: "",
        facts: Object.fromEntries(Object.entries(persona.facts ?? {}).map(([what, said]) => [what, String(said)])),
        state: persona.state ?? {},
      });
    } catch (refused) {
      // Half a migration is the one thing this verb must never leave in silence: a second run has
      // to know which callers are already the gateway's and which are still only files.
      err.write(`${halfWay(landed, inFiles.map((one) => one.name).slice(landed.length), refused)}\n`);
      return 2;
    }
    landed.push(persona.name);
    if (!asJson) out.write(`  ${persona.name}\n`);
  }
  out.write(asJson ? `${JSON.stringify({ personas: kept })}\n` : `${landed.length} persona(s) pushed from ${folder}\n`);
  return 0;
}

/** What a push that stopped says: what the gateway now holds, what it does not, and why it stopped. */
function halfWay(landed: string[], left: string[], refused: unknown): string {
  return [
    `${left[0]} was refused: ${refused instanceof Error ? refused.message : String(refused)}`,
    `  pushed: ${landed.length === 0 ? "nothing" : landed.join(", ")}`,
    `  still only files: ${left.join(", ")}`,
    "  nothing was undone and no file was touched: push again once it is fixed",
  ].join("\n");
}
