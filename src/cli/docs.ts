/** `pinecall docs push | list | drop | eval | attach | detach | attached`: the bases the agent searches, and which agent reads which. */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { parseArgs } from "node:util";

import type { KnowledgeFile, KnowledgeList, KnowledgePushed, KnowledgeScore, TuningAnswer } from "@pinecall/protocol";

import { slugOf } from "../runtime/connect.js";
import { theDoor } from "./env.js";
import type { Group } from "./groups.js";
import { readSettings, theCornerRead } from "./agent-lines.js";
import { attach, attached, attachingOf, detach } from "./docs-attach.js";
import { agentOfThisDirectory, load, notASlug } from "./load.js";
import { AGENT_FLAG, homeOf, homesFor, oneHome, type Home } from "./home.js";
import { asked, type Door } from "./testing/gateway.js";
import { refusal } from "./whoami.js";

const USAGE = `usage: pinecall docs push [dir] [--base <name>] [--agent <name>] [--file agent.tsx]
       pinecall docs list
       pinecall docs drop <base>
       pinecall docs eval [docs.json] [--base <name>] [--k <n>] [--agent <name>] [--file agent.tsx]
       pinecall docs attach <base> [--k <n>] [--mode retrieved|tool] [--min-score <x>] [--agent <slug>] [--team]
       pinecall docs detach <base> [--agent <slug>] [--team]
       pinecall docs attached
                                        … and any of them with --prod, in production`;

/** Where a base is refused before a byte is sent: the three sentences both doors say. */
export const NO_DIRECTORY = (directory: string): string => `no documents directory at ${directory}`;
export const NO_MARKDOWN = (directory: string): string => `no *.md under ${directory}: nothing to push`;
export const NO_GOLDEN = (golden: string): string => `no golden at ${golden}: a JSON list of {asks, expects}`;
export const AN_EMPTY_GOLDEN = (golden: string): string =>
  `${golden} holds no questions: a golden is a JSON list of {asks, expects}`;

export const group: Group = {
  purpose: "the documents the agent searches: pushed as a base, listed, dropped, held to a golden, attached",
  usage: `${USAGE}

  push reads every *.md under the directory (docs/<name>/ of the project when none is named) and
  sends the folder whole to PUT /v1/knowledge/<base>: the base is replaced, never merged. The base
  is the agent's slug unless --base says otherwise. list prints every base this org has pushed in
  the world asked; drop removes one. These are the documents a turn SEARCHES — the RAG. What the
  agent knows by heart is not a document: it is its settings' knowledge (\`pinecall agent
  knowledge\`), read whole on every call.

  attach says an agent reads a base — in your own corner, or the team's with --team, or in
  production with --prod — with how a turn reads it: --k chunks, --mode (retrieved: the platform
  searches before the turn; tool: the model decides when), --min-score. It is one field of the
  agent's settings (\`pinecall agent\`), written as the next version. detach takes it out;
  attached prints which agents read which base in the world asked.

  eval asks the base every question of a golden — test/<name>/goldens/docs.json, a JSON list of
  {asks, expects}, where expects is the heading path the answer should carry — and prints
  recall@k and nDCG@10, computed by code with no model in the loop, plus every question it
  missed and what came back instead. A golden is fixed and the index is the variable: never
  soften a question so a change can pass.`,
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
    options: {
      base: { type: "string" },
      file: { type: "string" },
      k: { type: "string" },
      mode: { type: "string" },
      "min-score": { type: "string" },
      team: { type: "boolean", default: false },
      ...AGENT_FLAG,
    },
  });
  const [verb, ...rest] = positionals;
  const door = theDoor(how.env ?? process.env, err);
  if (door === undefined) return 2;
  try {
    if (verb === "attached") return await attached(door, out);
    if ((verb === "attach" || verb === "detach") && rest[0] !== undefined) {
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
      if (verb === "attach") return await attach(door, agent, rest[0], attachingOf(values), values.team, out);
      return await detach(door, agent, rest[0], values.team, out, err);
    }
    if (verb === "push" || verb === "eval") {
      // A dir, a golden or a base typed is about one agent; nothing typed, at a project's root, is
      // every agent that has documents (push) or a golden (eval).
      const typed = rest[0] !== undefined || values.base !== undefined;
      const homes = typed ? [] : await homesFor(values.file, values.agent);
      if (homes.length > 1) {
        let worst = 0;
        for (const home of homes) {
          const has = verb === "push" ? existsSync(home.docs) : existsSync(home.docsGolden);
          if (!has) {
            out.write(`${home.name} · no ${verb === "push" ? `documents at ${home.docs}` : `golden at ${home.docsGolden}`}\n`);
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
    // A directory or a golden typed beside --agent is still that agent's: its slug is the base.
    // The class is only needed when no base was typed, so the agent is resolved only then.
    const theFile = async (): Promise<string | undefined> =>
      values.base !== undefined && rest[0] !== undefined ? values.file : (await oneHome(`docs ${verb}`, values.file, values.agent)).file;
    if (verb === "push") return await push(door, rest[0], values.base, await theFile(), out, err);
    if (verb === "list") return await list(door, out);
    if (verb === "drop" && rest[0] !== undefined) return await drop(door, rest[0], out);
    if (verb === "eval") return await evaluate(door, rest[0], values.base, values.k, await theFile(), out, err);
  } catch (refused) {
    // The gateway's own sentence, as it was said: "this gateway keeps no knowledge: it runs on
    // a dev key" names the fix, and nothing here knows better.
    err.write(`${refusal(refused)}\n`);
    return 1;
  }
  err.write(`${USAGE}\n`);
  return 2;
}

// The folder as of now, whole. The directory and the base default to the agent's home — its
// `docs/<name>/` and its slug — and the class is loaded only when one of the two is missing, so a
// push that names both costs no TypeScript loader.
async function push(
  door: Door,
  dir: string | undefined,
  base: string | undefined,
  agent: string | undefined,
  out: NodeJS.WritableStream,
  err: NodeJS.WritableStream,
): Promise<number> {
  const loaded = dir === undefined || base === undefined ? await load(agent) : undefined;
  const directory = resolve(dir ?? homeOf(loaded!.file).docs);
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
    out.write(`no base pushed yet: pinecall docs push sends docs/<name>/ under the agent's slug\n`);
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
  const golden = resolve(file ?? homeOf(loaded!.file).docsGolden);
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
  // Nobody named a k: ask at the one this agent reads that base with. A `--base` somebody typed
  // belongs to an agent this verb was not told about, so that one is asked at the door's default.
  const attachment = loaded === undefined ? null : await readSettings(door, slugOf(loaded.ctor)).catch(() => null);
  const asked = k === undefined ? theKItIsReadWith(attachment, name) : Number(k);
  const score = await scoredOn(door, name, questions, asked);
  out.write(`${scoreLines(score).join("\n")}\n`);
  return score.misses.length === 0 ? 0 : 1;
}

// A golden asks what a TURN gets, so the k it asks with is the k the agent reads that base with —
// the attachment's, in this world and corner, not a constant. The gateway's own default is eight
// and an agent that attached its base with `--k 4` was measured at eight: `recall@8 0.92` on a
// base whose calls were running at `recall@4 0.75`, which is the figure a person was reading and
// acting on (2026-09-20). A base this agent does not read is measured at the gateway's default,
// because there is no attachment to ask.
export function theKItIsReadWith(standing: TuningAnswer | null, base: string): number | undefined {
  const corner = standing === null ? null : theCornerRead(standing);
  return (corner?.config.bases ?? []).find((one) => one.base === base)?.k ?? undefined;
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
  return await evaluate(door, home.docsGolden, slugOf(loaded.ctor), k, home.file, out, err);
}
