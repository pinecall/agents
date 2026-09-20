/** `pinecall runs promote`: one real call written down as a golden candidate, from its own verdicts. */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { CallScore, Judgment } from "@pinecall/protocol";

import { entriesOf, type Door, type Entry } from "../testing/gateway.js";
import type { Expect, Golden } from "../testing/goldens.js";

/** Where a call promoted to a golden lands: beside the goldens, in a folder a person reviews. */
export const CANDIDATES = "test/candidates";

/** What promote was asked for: what to call it, where to put it, and where to cut the call. */
export interface Promotion {
  name?: string;
  out: string;
  fromSeq: number;
}

/** What to say about a call nobody judged: there is no verdict, so there is nothing to derive. */
export const NOT_JUDGED = "was not judged, so there is no verdict to write an expect from";

/**
 * What a broken consent writes, and what is still the person's to decide. `expect.not` is judged
 * on WORDS and would go green on the very break the call was promoted for; `expect.not_tools` is
 * judged on the log, so the tool that ran unasked goes there. The ORDER rule stays the runtime's.
 */
export const CONSENT_BANS_THE_TOOL =
  "consent broke, so the tool that ran unasked is in expect.not_tools: keep it only if this call must never call it at all — the order itself is the runtime's own policy over state and input";

/**
 * A real call as a golden candidate: the state it was in, the words the caller said from there,
 * and an `expect` derived from what the judges answered at hang-up. It is a CANDIDATE — it carries
 * `promoted_from` and a person edits it before it counts as a golden.
 */
export async function promoted(
  door: Door,
  call: string,
  wanted: Promotion,
  out: NodeJS.WritableStream,
  err: NodeJS.WritableStream = process.stderr,
  asJson = false,
): Promise<number> {
  let written: Written;
  try {
    written = await promotedTo(door, call, wanted);
  } catch (refused) {
    err.write(`${refused instanceof Error ? refused.message : String(refused)}\n`);
    return 1;
  }
  out.write(asJson ? `${JSON.stringify(written)}\n` : `${linesOf(written, wanted.fromSeq).join("\n")}\n`);
  return 0;
}

/** A promoted call: the file it landed in, the golden itself, and what is still a person's to decide. */
export interface Written {
  path: string;
  candidate: Golden;
  notes: string[];
}

/** The one place a call becomes a file. The verb prints what comes back; the console links to it. */
export async function promotedTo(door: Door, call: string, wanted: Promotion): Promise<Written> {
  const entries = await entriesOf(door, call);
  if (entries.length === 0) throw new Error(`no log for call ${call} on this gateway`);
  const score = theScoreIn(entries);
  if (score === null || score.passed === null || score.passed === undefined) {
    throw new Error(`${call} ${NOT_JUDGED}: ${whyNobodyJudged(score)}`);
  }
  const candidate = candidateOf(call, entries, wanted.fromSeq, score, wanted.name);
  await mkdir(wanted.out, { recursive: true });
  const path = join(wanted.out, `${candidate.name}.json`);
  await writeFile(path, `${JSON.stringify(candidate, null, 2)}\n`, "utf8");
  return { path, candidate, notes: notesOn(score, candidate.expect ?? {}) };
}

/** What a promotion prints: where it landed, how much of the call it took, and the notes on it. */
export function linesOf(written: Written, fromSeq: number): string[] {
  return [`${written.path}  ${written.candidate.input.length} caller turn(s) from seq ${fromSeq}`, ...written.notes];
}

/**
 * The golden a call reduces to: the state as it stood at `fromSeq`, every caller turn after it,
 * and what the judges said the call owed. `state.changed` carries the whole state, so folding is
 * taking the last one below the cut.
 */
export function candidateOf(
  call: string,
  entries: Entry[],
  fromSeq: number,
  score: CallScore,
  name?: string,
): Golden {
  const state = entries
    .filter((entry) => entry.type === "state.changed" && entry.seq <= fromSeq)
    .at(-1)?.data["state"];
  return {
    name: name ?? call,
    promoted_from: call,
    ...(typeof state === "object" && state !== null ? { state: state as Record<string, unknown> } : {}),
    input: entries
      .filter((entry) => entry.type === "turn.user" && entry.seq > fromSeq)
      .map((entry) => String(entry.data["text"] ?? "")),
    expect: expectOf(score, entries),
  };
}

/**
 * What the call owed, read off its own verdicts. A broken `grounded` and a broken `consent` each
 * have an `expect` field of their own; every other judge is a sentence a person writes, and a
 * candidate says so on stdout rather than inventing a field for it.
 */
export function expectOf(score: CallScore, entries: Entry[]): Expect {
  const expect: Expect = {};
  for (const judgment of broken(score)) {
    if (judgment.name === "grounded") expect.grounded = true;
    if (judgment.name === "consent") {
      const banned = toolsAt(judgment.evidence.seqs, entries);
      if (banned.length > 0) expect.not_tools = banned;
    }
  }
  return expect;
}

/** The `call.score` a sealed log ends on, or null when this call carries none at all. */
export function theScoreIn(entries: Entry[]): CallScore | null {
  const found = entries.filter((entry) => entry.type === "call.score").at(-1);
  return found === undefined ? null : (found.data as unknown as CallScore);
}

// Every judge that answered broken, in the order the entry wrote them.
function broken(score: CallScore): Judgment[] {
  return score.judges.filter((judgment) => judgment.verdict === "broken");
}

// The tool a judgment's own seqs point at. Consent names two entries — the call and the
// confirmation that came too late — and only one of them is a `tool.call`, so the type is what
// picks it rather than the order the sentence happened to write them in.
function toolsAt(seqs: number[], entries: Entry[]): string[] {
  const named = entries
    .filter((entry) => entry.type === "tool.call" && seqs.includes(entry.seq))
    .map((entry) => String(entry.data["name"] ?? ""));
  return [...new Set(named.filter((name) => name !== ""))];
}

// What the person who opens the candidate has to decide, said here so the file stays a golden and
// never grows a field for prose. A judge no `expect` field can carry is named with its reason and
// nothing else — and consent says what it DID write, so nobody keeps a ban they never read.
function notesOn(score: CallScore, expect: Expect): string[] {
  const notes: string[] = [];
  for (const judgment of broken(score)) {
    notes.push(`  ${judgment.name} broke: ${judgment.reason}`);
  }
  if (expect.not_tools !== undefined) notes.push(`  ${CONSENT_BANS_THE_TOOL}`);
  if (notes.length === 0) notes.push("  nothing broke: write what this call must keep doing");
  return notes;
}

// A call with no `call.score` at all was never judged and never said why — an older log, or a box
// with no judges that predates ring 4. The entry's own sentence is preferred whenever there is one.
function whyNobodyJudged(score: CallScore | null): string {
  if (score === null) return "its log carries no call.score at all";
  return score.not_judged ?? "the entry says nothing about why";
}
