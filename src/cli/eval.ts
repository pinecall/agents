/** `pinecall eval <call-id>`: ring 3 — one real call, re-evaluated by the runtime's code checks. */

import { parseArgs } from "node:util";

import { theDoor } from "./env.js";
import type { Group } from "./groups.js";
import { readNamedJson } from "./named-file.js";
import { asked, type Door } from "./testing/gateway.js";

/** One check's answer, as `POST /v1/evals/replay/{call}` writes it: three strings, no nesting. */
export interface Verdict {
  check: string;
  status: string;
  detail: string;
}

/** What the door answers about one call: who it was, whether it holds, and the verdicts. */
export interface Answer {
  call: string;
  agent: string;
  passed: boolean;
  verdicts: Verdict[];
}

/** The words a business will not have its agent say, and the latencies it holds a call to. */
export interface Case {
  banned?: string[];
  budget?: Record<string, number>;
}

export const group: Group = {
  purpose: "ring 3: one real call, re-evaluated",
  usage: `usage: pinecall eval <call-id> [--policy policy.json] [--json]

  One finished call rebuilt from its log and answered by the runtime's four CODE checks —
  consent, register, errors, latency. Nothing is re-run and no model is asked; the verdicts are
  the operator's vocabulary (passed · failed · deferred · skipped), never a judge's four words.
  Exits 1 when a check did not hold.

  --policy file   {"banned": ["…"], "budget": {"llm_ttft": 1.5}} — the words this business will
                  not have its agent say, and the latencies it holds a call to
  --json          the answer as the door wrote it`,
  run,
};

/**
 * The judgement runs in the runtime, which is where the log, the store and the judges are. This
 * verb builds the case and prints the answer, so a person needs no Python to read a call.
 */
export async function run(argv: string[], out: NodeJS.WritableStream = process.stdout): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { json: { type: "boolean", default: false }, policy: { type: "string" } },
  });
  const call = positionals[0];
  if (call === undefined) {
    process.stderr.write("usage: pinecall eval <call-id> [--policy policy.json] [--json]\n");
    return 2;
  }
  const door = await theDoor();
  if (door === undefined) return 2;
  // The policy is read BEFORE the gateway is asked anything: a path with a typo in it is a
  // command that cannot run (exit 2), not a measurement that did not hold (exit 1).
  const policy = theCase(values.policy);
  let answer: Answer;
  try {
    answer = await replayed(door, call, policy);
  } catch (refused) {
    process.stderr.write(`${refused instanceof Error ? refused.message : String(refused)}\n`);
    return 1;
  }
  out.write(values.json === true ? `${JSON.stringify(answer)}\n` : `${linesOf(answer).join("\n")}\n`);
  return answer.passed ? 0 : 1;
}

/**
 * The four code checks over one call, asked of the gateway. `simulate --judge` asks it again after
 * every turn, which is why the request lives here rather than inside this verb's own argument
 * parsing: one door, one sentence when it refuses.
 */
export async function replayed(door: Door, call: string, said: Case): Promise<Answer> {
  return asked<Answer>(door, replayPath(call), { method: "POST", body: said });
}

/** The door this verb knocks at: the call in the path, nothing in a query. */
export function replayPath(call: string): string {
  return `/v1/evals/replay/${encodeURIComponent(call)}`;
}

/** That door under the gateway's HTTP address, as a person would paste it. */
export function replayUrl(base: string, call: string): string {
  return `${base.replace(/\/$/, "")}${replayPath(call)}`;
}

/** The case as a person reads it: the call on top, then a line per check, aligned by name. */
export function linesOf(answer: Answer): string[] {
  const width = Math.max(...answer.verdicts.map((verdict) => verdict.check.length));
  return [
    `${answer.call}  ${answer.agent}`,
    ...answer.verdicts.map(
      (verdict) => `  ${verdict.check.padEnd(width)}  ${verdict.status.padEnd(8)}  ${verdict.detail}`,
    ),
  ];
}

// The words and the budget are the business's, so they come out of a file the business keeps.
// A generated `evals/policies` would be the same JSON; nothing here cares which wrote it.
function theCase(policy: string | undefined): Case {
  if (policy === undefined) return {};
  return readNamedJson<Case>("--policy", policy);
}
