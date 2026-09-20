/** `pinecall memory <contact> | forget <contact> | eval`: what memory kept about one contact, the right to be forgotten, and how well recall ranks. */

import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { parseArgs } from "node:util";

import type { ContactFact, ContactMemory, Forgotten, MemoryScore } from "@pinecall/protocol";

import { theDoor } from "./env.js";
import type { Group } from "./groups.js";
import { dayAndTime, theQuestionsIn } from "./docs.js";
import { load } from "./load.js";
import { AGENT_FLAG, homeOf, oneHome } from "./home.js";
import { asked, type Door } from "./testing/gateway.js";
import { refusal } from "./whoami.js";

const USAGE = `usage: pinecall memory <contact>
       pinecall memory forget <contact>
       pinecall memory policy [--remember '…' …] [--forget '…' …] [--team] [--note '…'] [--agent <slug>]
       pinecall memory eval [golden.json] [--k <n>] [--agent <name>] [--file agent.tsx]`;

// The door takes the whole golden and needs no contact: every question carries its own facts.
const EVAL = "/v1/contacts/memory/eval";

/** The two sentences a golden is refused by, said the same in the terminal and on the page. */
export const NO_GOLDEN = (golden: string): string => `no golden at ${golden}: a JSON list of {holds, asks, expects}`;
export const AN_EMPTY_GOLDEN = (golden: string): string =>
  `${golden} holds no questions: a golden is a JSON list of {holds, asks, expects}`;

// A fact that a later call superseded is still in the history, and it is drawn dimmer so the
// current ones read first — on a terminal, that is; a pipe gets the plain line.
const DIM = "\u001b[2m";
const PLAIN = "\u001b[0m";

export const group: Group = {
  purpose: "what memory kept about a contact, forget it on request, and what a golden says of recall",
  usage: `${USAGE}

  With a contact — the caller's number, or the id the app named — prints everything memory ever
  kept about them: the current facts first, then the ones a later call superseded, with the date
  they stopped holding. forget erases all of it, the right to be forgotten; on a terminal it asks
  once, and it prints how many facts went.

  eval asks recall every question of a golden — a JSON list of {holds, asks, expects}, where holds
  is what memory holds about that question's contact — and prints recall@k and nDCG@10, computed by
  code with no model in the loop, plus every question it did not answer whole. No contact of yours
  is read or written: each question's facts go to a scratch contact and are deleted again. A golden
  is fixed and the ranking is the variable: never soften a question so a change can pass.

  policy is what the agent keeps about a caller and what it never does — the org's to say, set in
  the world beside the agent's other settings (\`pinecall agent\`), and a supervisor's or a
  manager's key opens it. With nothing typed it prints the policy of the three corners.`,
  run,
};

/** What the verb can be told besides the argv: where to print, the environment, and how it asks. Tests only. */
export interface Recalling {
  out?: NodeJS.WritableStream;
  err?: NodeJS.WritableStream;
  env?: NodeJS.ProcessEnv;
  /** Whether the person said yes to forgetting. A test answers here instead of driving a terminal. */
  confirm?: (question: string) => Promise<boolean>;
}

/** Read the contact and do it: the history on stdout, or one forget after one question. */
export async function run(argv: string[], how: Recalling = {}): Promise<number> {
  const out = how.out ?? process.stdout;
  const err = how.err ?? process.stderr;
  // The policy is a field of the agent's settings and takes their flags, so it parses its own.
  if (argv[0] === "policy") return await (await import("./memory-policy.js")).policy(argv.slice(1), how);
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { file: { type: "string" }, k: { type: "string" }, ...AGENT_FLAG },
  });
  const [verb, second] = positionals;
  const door = theDoor(how.env ?? process.env, err);
  if (door === undefined) return 2;
  try {
    if (verb === "eval") {
      const file = second === undefined ? (await oneHome("memory eval", values.file, values.agent)).file : values.file;
      return await evaluate(door, second, values.k, file, out, err);
    }
    if (verb === "forget" && second !== undefined) {
      return await forget(door, second, how.confirm ?? askOnATerminal, out);
    }
    if (verb !== undefined && verb !== "forget") return await history(door, verb, out);
  } catch (refused) {
    err.write(`${refusal(refused)}\n`);
    return 1;
  }
  err.write(`${USAGE}\n`);
  return 2;
}

async function history(door: Door, contact: string, out: NodeJS.WritableStream): Promise<number> {
  const remembered = await asked<ContactMemory>(door, memoryPath(contact));
  if (remembered.facts.length === 0) {
    out.write(`nothing remembered about ${contact}\n`);
    return 0;
  }
  const dim = (out as { isTTY?: boolean }).isTTY === true;
  for (const fact of remembered.facts) {
    out.write(`${factLine(fact, dim)}\n`);
  }
  return 0;
}

async function forget(
  door: Door,
  contact: string,
  confirm: (question: string) => Promise<boolean>,
  out: NodeJS.WritableStream,
): Promise<number> {
  if (!(await confirm(`forget everything memory kept about ${contact}? [y/N] `))) {
    out.write("nothing forgotten\n");
    return 0;
  }
  const gone = await asked<Forgotten>(door, memoryPath(contact), { method: "DELETE" });
  out.write(`forgotten: ${gone.forgotten}\n`);
  return 0;
}

// A golden is run when somebody changed the vocabulary a fact is written in, the embedder or a
// knob — never on a caller's clock — so it reads its questions off the disk and asks them in order.
// No contact of the org is read: each question's facts are the question's own.
async function evaluate(
  door: Door,
  file: string | undefined,
  k: string | undefined,
  agent: string | undefined,
  out: NodeJS.WritableStream,
  err: NodeJS.WritableStream,
): Promise<number> {
  const golden = resolve(file ?? homeOf((await load(agent)).file).memoryGolden);
  if (!existsSync(golden)) {
    err.write(`${NO_GOLDEN(golden)}\n`);
    return 2;
  }
  const questions = theQuestionsIn(golden);
  if (questions === null) {
    err.write(`${AN_EMPTY_GOLDEN(golden)}\n`);
    return 2;
  }
  const score = await recalledOn(door, questions, k === undefined ? undefined : Number(k));
  out.write(`${recallLines(score).join("\n")}\n`);
  return score.misses.length === 0 ? 0 : 1;
}

/** Every question of a golden asked of recall, and the two figures code computed from the answers. */
export async function recalledOn(door: Door, questions: unknown[], k: number | undefined): Promise<MemoryScore> {
  return await asked<MemoryScore>(door, EVAL, { method: "POST", body: { questions, ...(k === undefined ? {} : { k }) } });
}

/** What a golden prints: the two figures on one line, then a line per question memory did not answer whole. */
export function recallLines(score: MemoryScore): string[] {
  const figures =
    `memory · ${score.model} · ${score.questions} questions · ` +
    `recall@${score.k} ${score.recall_at_k.toFixed(2)} · nDCG@10 ${score.ndcg_at_10.toFixed(2)} · ` +
    `${Math.round(score.took_ms)} ms`;
  return [
    figures,
    ...score.misses.map(
      (missed) => `  missed: ${missed.asks} → wanted ${missed.missing.join(", ")}, got ${missed.found[0] ?? "nothing"}`,
    ),
  ];
}

/** One fact as a line: the text, its category when it has one, and — dimmed — when it stopped holding. */
export function factLine(fact: ContactFact, dim: boolean): string {
  const said = [`- ${fact.text}`];
  if (fact.category) said.push(`(${fact.category})`);
  if (fact.invalidated_at === null) return said.join(" ");
  said.push(`· until ${dayAndTime(fact.invalidated_at)}`);
  const line = said.join(" ");
  return dim ? `${DIM}${line}${PLAIN}` : line;
}

function memoryPath(contact: string): string {
  return `/v1/contacts/${encodeURIComponent(contact)}/memory`;
}

// The one question, on a terminal. Off one — a script, CI — nobody is there to answer, and the
// verb was typed on purpose: it goes ahead.
async function askOnATerminal(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) return true;
  const reading = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((typed) => reading.question(question, typed));
  reading.close();
  return /^y(es)?$/i.test(answer.trim());
}
