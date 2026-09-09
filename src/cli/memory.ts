/** `pinecall memory <contact> | forget <contact>`: what memory kept about one contact, and the right to be forgotten. */

import { createInterface } from "node:readline";

import type { ContactFact, ContactMemory, Forgotten } from "@pinecall/protocol";

import { theDoor } from "./env.js";
import type { Group } from "./groups.js";
import { dayAndTime } from "./knowledge.js";
import { asked, type Door } from "./testing/gateway.js";
import { refusal } from "./whoami.js";

const USAGE = `usage: pinecall memory <contact>
       pinecall memory forget <contact>`;

// A fact that a later call superseded is still in the history, and it is drawn dimmer so the
// current ones read first — on a terminal, that is; a pipe gets the plain line.
const DIM = "\u001b[2m";
const PLAIN = "\u001b[0m";

export const group: Group = {
  purpose: "what memory kept about a contact, and forget it on request",
  usage: `${USAGE}

  With a contact — the caller's number, or the id the app named — prints everything memory ever
  kept about them: the current facts first, then the ones a later call superseded, with the date
  they stopped holding. forget erases all of it, the right to be forgotten; on a terminal it asks
  once, and it prints how many facts went.`,
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
  const [first, second] = argv;
  const forgetting = first === "forget";
  const contact = forgetting ? second : first;
  if (contact === undefined || contact.startsWith("-")) {
    err.write(`${USAGE}\n`);
    return 2;
  }
  const door = theDoor(how.env ?? process.env, err);
  if (door === undefined) return 2;
  try {
    if (forgetting) return await forget(door, contact, how.confirm ?? askOnATerminal, out);
    return await history(door, contact, out);
  } catch (refused) {
    err.write(`${refusal(refused)}\n`);
    return 1;
  }
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
