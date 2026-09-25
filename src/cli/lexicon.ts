/** `pinecall lexicon`: the org's words — how the voice says them, what the ears must know — versioned. */

import { parseArgs } from "node:util";

import type { LexiconAnswer, LexiconBody, LexiconHistory, LexiconRow } from "@pinecall/protocol";

import { theCornerRead, theCornerWritten } from "./agent-lines.js";
import { theDoor } from "./env.js";
import type { Group } from "./groups.js";
import { dayAndTime } from "./docs.js";
import { asked, type Door } from "./testing/gateway.js";
import { refusal } from "./whoami.js";

const USAGE = [
  "usage: pinecall lexicon [--json]",
  "       pinecall lexicon add <word> --say '…' [--team] [--note '…']",
  "       pinecall lexicon hear <word> [<word> …] [--team] [--note '…']",
  "       pinecall lexicon rm <word> [<word> …] [--team]",
  "       pinecall lexicon history [--team]",
].join("\n");

const LEXICON = "/v1/lexicon";

export const group: Group = {
  purpose: "the org's words: how the voice says them and what the ears must know, shared by every agent",
  usage: `${USAGE}

  The lexicon is the org's and not one agent's: a brand, a surname, an acronym is the same word
  whichever agent says it, and it is laid over every agent's own says and hears — the org's word
  wins where both say the same one. add says how a word is spoken; hear names the words the ears
  must know; rm takes words out of both. Whole and versioned like the settings: the corner is
  yours (--team: the org's own), and a save over a corner that moved is told so.

  A supervisor's or a manager's key opens this door: the person who hears a word said wrong forty
  times a day fixes it, without a developer and without a deploy — with --prod, in production,
  when their org lets them act there.`,
  run,
};

/** What the verb can be told besides the argv: where to print, and which environment. Tests only. */
export interface Wording {
  out?: NodeJS.WritableStream;
  err?: NodeJS.WritableStream;
  env?: NodeJS.ProcessEnv;
}

export async function run(argv: string[], how: Wording = {}): Promise<number> {
  const out = how.out ?? process.stdout;
  const err = how.err ?? process.stderr;
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      json: { type: "boolean", default: false },
      team: { type: "boolean", default: false },
      say: { type: "string" },
      note: { type: "string" },
    },
  });
  const door = await theDoor(how.env ?? process.env, err);
  if (door === undefined) return 2;
  const [verb, ...words] = positionals;
  const team = values.team === true;
  try {
    if (verb === undefined) return said(await asked<LexiconAnswer>(door, LEXICON), values.json === true, out);
    if (verb === "add" && words[0] !== undefined && values.say !== undefined) {
      return said(await changed(door, team, values.note, (words_) => ({ ...words_, said: { ...words_.said, [words[0]!]: values.say! } })), values.json === true, out);
    }
    if (verb === "hear" && words.length > 0) {
      return said(await changed(door, team, values.note, (words_) => ({ ...words_, heard: [...new Set([...words_.heard, ...words])] })), values.json === true, out);
    }
    if (verb === "rm" && words.length > 0) {
      return said(
        await changed(door, team, values.note, (words_) => ({
          said: Object.fromEntries(Object.entries(words_.said).filter(([word]) => !words.includes(word))),
          heard: words_.heard.filter((word) => !words.includes(word)),
        })),
        values.json === true,
        out,
      );
    }
    if (verb === "history") return await history(door, team, out);
  } catch (refused) {
    err.write(`${refusal(refused)}\n`);
    return 1;
  }
  err.write(`${USAGE}\n`);
  return 2;
}

/** The lexicon as a person edits it: a map of words to their spoken form, and the heard list. */
interface Words {
  said: Record<string, string>;
  heard: string[];
}

function wordsOf(body: LexiconBody | undefined): Words {
  return { said: Object.fromEntries((body?.said ?? []).map((one) => [one.word, one.spoken])), heard: [...(body?.heard ?? [])] };
}

function bodyOf(words: Words): LexiconBody {
  return { said: Object.entries(words.said).map(([word, spoken]) => ({ word, spoken })), heard: words.heard };
}

// Read the corner's own row, change it, and send it whole with the version it was read at.
async function changed(door: Door, team: boolean, note: string | undefined, change: (words: Words) => Words): Promise<LexiconAnswer> {
  const standing = await asked<LexiconAnswer>(door, LEXICON);
  // The row AND the version come from the one corner this write lands on. They used to be read
  // apart — the words off the corner, the version off `yours` — so a key that holds no corner of
  // its own (a server's token, a CI key, a person in production) sent the team's words with no
  // version at all, and the door has nothing to refuse: two people saving at once, and the second
  // one wins silently instead of being told where the corner is now (2026-09-20).
  const row = theCornerWritten(standing, team);
  return await asked<LexiconAnswer>(door, LEXICON, {
    method: "PUT",
    body: { lexicon: bodyOf(change(wordsOf(row?.lexicon))), if_version: row?.version ?? null, note: note ?? null, team },
  });
}

async function history(door: Door, team: boolean, out: NodeJS.WritableStream): Promise<number> {
  const kept = await asked<LexiconHistory>(door, `${LEXICON}/history?team=${team}`);
  out.write(`lexicon · ${kept.world} · ${kept.holder === "" ? "the org's own corner" : `corner ${kept.holder}`}\n`);
  if (kept.rows.length === 0) out.write("  nothing set yet\n");
  for (const row of kept.rows) out.write(`  ${rowLine(row)}   said ${row.lexicon.said.length} · heard ${row.lexicon.heard.length}\n`);
  return 0;
}

function rowLine(row: LexiconRow): string {
  const said = [`v${row.version}`, row.author, dayAndTime(row.set_at)];
  if (row.note !== null) said.push(`"${row.note}"`);
  return said.join(" · ");
}

function said(answer: LexiconAnswer, asJson: boolean, out: NodeJS.WritableStream): number {
  out.write(asJson ? `${JSON.stringify(answer)}\n` : `${linesOf(answer).join("\n")}\n`);
  return 0;
}

/** The page: what the corner reads, then which version each corner is at. */
export function linesOf(answer: LexiconAnswer): string[] {
  const read = theCornerRead(answer);
  const lines = [`lexicon · ${answer.world}${answer.yours === null ? "" : " · your corner"}`];
  if (read === null) lines.push("  nothing set: every agent says its own words");
  else {
    const spoken = read.lexicon.said.map((one) => `${one.word} → "${one.spoken}"`).join(" · ");
    lines.push(`  said     ${spoken || "—"}`);
    lines.push(`  heard    ${read.lexicon.heard.join(" · ") || "—"}`);
  }
  lines.push("");
  const corners: [string, LexiconRow | null][] = [["yours", answer.yours], ["team", answer.team], ["production", answer.production]];
  lines.push(`  ${corners.map(([name, row]) => `${name}: ${row === null ? "nothing set" : rowLine(row)}`).join(" · ")}`);
  return lines;
}
