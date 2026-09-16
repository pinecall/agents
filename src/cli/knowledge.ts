/** `pinecall knowledge push | list | drop | eval`: the base the agent answers from, and what a golden says of it. */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { parseArgs } from "node:util";

import type { KnowledgeFile, KnowledgeList, KnowledgePushed, KnowledgeScore } from "@pinecall/protocol";

import { slugOf } from "../runtime/connect.js";
import { theDoor } from "./env.js";
import type { Group } from "./groups.js";
import { load } from "./load.js";
import { AGENT_FLAG, homesFor, type Home } from "./home.js";
import { asked, type Door } from "./testing/gateway.js";
import { refusal } from "./whoami.js";

const USAGE = `usage: pinecall knowledge push [dir] [--base <name>] [--agent <name>] [--file agent.tsx]
       pinecall knowledge list
       pinecall knowledge drop <base>
       pinecall knowledge eval [golden.json] [--base <name>] [--k <n>] [--agent <name>] [--file agent.tsx]`;

/** Where a base is refused before a byte is sent: the three sentences both doors say. */
export const NO_DIRECTORY = (directory: string): string => `no knowledge directory at ${directory}`;
export const NO_MARKDOWN = (directory: string): string => `no *.md under ${directory}: nothing to push`;
export const NO_GOLDEN = (golden: string): string => `no golden at ${golden}: a JSON list of {asks, expects}`;
export const AN_EMPTY_GOLDEN = (golden: string): string =>
  `${golden} holds no questions: a golden is a JSON list of {asks, expects}`;

// The golden beside the documents it asks about: the questions the base is held to, and the chunk
// each should have found. `knowledge/golden.json` is where `eval` looks when nobody says.
export const DEFAULT_GOLDEN = "knowledge/golden.json";

// Where a tenant keeps what is retrieved per turn, beside the agent file: the layout every
// example has, and the one `docs = "<base>"` on the class was pushed from.
export const DEFAULT_DIR = "knowledge/docs";

export const group: Group = {
  purpose: "push | list | drop the knowledge base the agent answers from",
  usage: `${USAGE}

  push reads every *.md under the directory (./knowledge/docs beside the agent file when none
  is named) and sends the folder whole to PUT /v1/knowledge/<base>: the base is replaced, never
  merged. The base is the agent's slug unless --base says otherwise, and the class names it with
  \`docs = "<base>"\`. list prints every base this org has pushed; drop removes one.

  eval asks the base every question of a golden — a JSON list of {asks, expects}, where expects is
  the heading path the answer should carry — and prints recall@k and nDCG@10, computed by code with
  no model in the loop, plus every question it missed and what came back instead. A golden is fixed
  and the index is the variable: never soften a question so a change can pass.`,
  run,
};

/** What the verb can be told besides the argv: where to print, and which environment. Tests only. */
export interface Pushing {
  out?: NodeJS.WritableStream;
  err?: NodeJS.WritableStream;
  env?: NodeJS.ProcessEnv;
}

/** Read the sub-verb and do it: the folder to the gateway, the list off it, or one base gone. */
export async function run(argv: string[], how: Pushing = {}): Promise<number> {
  const out = how.out ?? process.stdout;
  const err = how.err ?? process.stderr;
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { base: { type: "string" }, file: { type: "string" }, k: { type: "string" }, ...AGENT_FLAG },
  });
  const [verb, ...rest] = positionals;
  const door = theDoor(how.env ?? process.env, err);
  if (door === undefined) return 2;
  try {
    if (verb === "push" || verb === "eval") {
      // A dir, a golden or a base typed is about one agent; nothing typed, at a project's root, is
      // every agent that has documents (push) or a golden (eval).
      const typed = rest[0] !== undefined || values.base !== undefined;
      const homes = typed ? [] : await homesFor(values.file, values.agent);
      if (homes.length > 1) {
        let worst = 0;
        for (const home of homes) {
          const has = verb === "push" ? existsSync(home.docs) : existsSync(home.knowledgeGolden);
          if (!has) {
            out.write(`${home.name} · no ${verb === "push" ? `documents at ${home.docs}` : `golden at ${home.knowledgeGolden}`}\n`);
            continue;
          }
          worst = Math.max(worst, verb === "push" ? await pushHome(door, home, out, err) : await evaluateHome(door, home, values.k, out, err));
        }
        return worst;
      }
      if (homes.length === 1 && !typed) {
        return verb === "push" ? await pushHome(door, homes[0]!, out, err) : await evaluateHome(door, homes[0]!, values.k, out, err);
      }
    }
    if (verb === "push") return await push(door, rest[0], values.base, values.file, out, err);
    if (verb === "list") return await list(door, out);
    if (verb === "drop" && rest[0] !== undefined) return await drop(door, rest[0], out);
    if (verb === "eval") return await evaluate(door, rest[0], values.base, values.k, values.file, out, err);
  } catch (refused) {
    // The gateway's own sentence, as it was said: "this gateway keeps no knowledge: it runs on
    // a dev key" names the fix, and nothing here knows better.
    err.write(`${refusal(refused)}\n`);
    return 1;
  }
  err.write(`${USAGE}\n`);
  return 2;
}

// The folder as of now, whole. The directory and the base default to what the agent file says —
// `./knowledge/docs` beside it and its slug — and the class is loaded only when one of the two is
// missing, so a push that names both costs no TypeScript loader.
async function push(
  door: Door,
  dir: string | undefined,
  base: string | undefined,
  agent: string | undefined,
  out: NodeJS.WritableStream,
  err: NodeJS.WritableStream,
): Promise<number> {
  const loaded = dir === undefined || base === undefined ? await load(agent) : undefined;
  const directory = resolve(dir ?? join(dirname(loaded!.file), DEFAULT_DIR));
  const name = base ?? slugOf(loaded!.ctor);
  if (!existsSync(directory) || !statSync(directory).isDirectory()) {
    err.write(`${NO_DIRECTORY(directory)}\n`);
    return 2;
  }
  const files = markdownUnder(directory);
  if (files.length === 0) {
    err.write(`${NO_MARKDOWN(directory)}\n`);
    return 2;
  }
  out.write(`${pushedLine(await pushedTo(door, name, files), files.length)}\n`);
  return 0;
}

async function list(door: Door, out: NodeJS.WritableStream): Promise<number> {
  const answered = await asked<KnowledgeList>(door, "/v1/knowledge");
  if (answered.bases.length === 0) {
    out.write(`no knowledge base pushed yet: pinecall knowledge push ./knowledge/docs --base <slug>\n`);
    return 0;
  }
  for (const base of answered.bases) {
    out.write(`${base.base} · ${base.chunks} chunks · pushed ${dayAndTime(base.pushed_at)}\n`);
  }
  return 0;
}

async function drop(door: Door, base: string, out: NodeJS.WritableStream): Promise<number> {
  await asked(door, `/v1/knowledge/${encodeURIComponent(base)}`, { method: "DELETE" });
  out.write(`dropped ${base}\n`);
  return 0;
}

// A golden is run when somebody changed the documents, the embedder or a knob — never on a
// caller's clock — so it reads its questions off the disk and asks them one at a time.
async function evaluate(
  door: Door,
  file: string | undefined,
  base: string | undefined,
  k: string | undefined,
  agent: string | undefined,
  out: NodeJS.WritableStream,
  err: NodeJS.WritableStream,
): Promise<number> {
  const loaded = file === undefined || base === undefined ? await load(agent) : undefined;
  const golden = resolve(file ?? join(dirname(loaded!.file), DEFAULT_GOLDEN));
  const name = base ?? slugOf(loaded!.ctor);
  if (!existsSync(golden)) {
    err.write(`${NO_GOLDEN(golden)}\n`);
    return 2;
  }
  const questions = theQuestionsIn(golden);
  if (questions === null) {
    err.write(`${AN_EMPTY_GOLDEN(golden)}\n`);
    return 2;
  }
  const score = await scoredOn(door, name, questions, k === undefined ? undefined : Number(k));
  out.write(`${scoreLines(score).join("\n")}\n`);
  return score.misses.length === 0 ? 0 : 1;
}

/** The folder, sent whole: the base is replaced and never merged. Both doors push through here. */
export async function pushedTo(door: Door, base: string, files: KnowledgeFile[]): Promise<KnowledgePushed> {
  return await asked<KnowledgePushed>(door, `/v1/knowledge/${encodeURIComponent(base)}`, {
    method: "PUT",
    body: { files },
  });
}

/** Every question of a golden asked of the base, and the two figures code computed from it. */
export async function scoredOn(
  door: Door,
  base: string,
  questions: unknown[],
  k: number | undefined,
): Promise<KnowledgeScore> {
  return await asked<KnowledgeScore>(door, `/v1/knowledge/${encodeURIComponent(base)}/eval`, {
    method: "POST",
    body: { questions, ...(k === undefined ? {} : { k }) },
  });
}

/** The questions a golden file holds, or nothing at all when it holds none. */
export function theQuestionsIn(golden: string): unknown[] | null {
  const questions: unknown = JSON.parse(readFileSync(golden, "utf8"));
  return Array.isArray(questions) && questions.length > 0 ? questions : null;
}

/** What a golden prints: the two figures on one line, then a line per question the base missed. */
export function scoreLines(score: KnowledgeScore): string[] {
  const figures =
    `${score.base} · ${score.model} · ${score.questions} questions · ` +
    `recall@${score.k} ${score.recall_at_k.toFixed(2)} · nDCG@10 ${score.ndcg_at_10.toFixed(2)} · ` +
    `${Math.round(score.took_ms)} ms`;
  return [
    figures,
    ...score.misses.map(
      (missed) => `  missed: ${missed.asks} → wanted ${missed.expects}, got ${missed.found[0] ?? "nothing"}`,
    ),
  ];
}

/** The one line a push prints: the base, what was sent, what it became, and how long it took. */
export function pushedLine(pushed: KnowledgePushed, files: number): string {
  return `${pushed.base} · ${files} files · ${pushed.chunks} chunks · ${Math.round(pushed.took_ms)} ms`;
}

/** Every *.md under a directory, its subdirectories included, as the wire carries a file: its path relative to the directory, and its text. */
export function markdownUnder(directory: string): KnowledgeFile[] {
  const found: KnowledgeFile[] = [];
  for (const entry of readdirSync(directory, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const path = join(entry.parentPath, entry.name);
    found.push({ path: relative(directory, path).split(sep).join("/"), text: readFileSync(path, "utf8") });
  }
  return found.sort((one, other) => (one.path < other.path ? -1 : 1));
}

/** Unix seconds as a person reads them: the day and the minute, in UTC, no fractions. */
export function dayAndTime(seconds: number): string {
  return new Date(seconds * 1000).toISOString().slice(0, 16).replace("T", " ");
}

/** One agent's documents to its base: the home says where they are, the class names the base. */
async function pushHome(door: Door, home: Home, out: NodeJS.WritableStream, err: NodeJS.WritableStream): Promise<number> {
  const loaded = await load(home.file);
  return await push(door, home.docs, slugOf(loaded.ctor), home.file, out, err);
}

/** One agent's golden against its base. */
async function evaluateHome(
  door: Door,
  home: Home,
  k: string | undefined,
  out: NodeJS.WritableStream,
  err: NodeJS.WritableStream,
): Promise<number> {
  const loaded = await load(home.file);
  return await evaluate(door, home.knowledgeGolden, slugOf(loaded.ctor), k, home.file, out, err);
}
