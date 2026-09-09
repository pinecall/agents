/** The `call.score` entry as a person reads it: what each judge said, and what the asking cost. */

import type { CallScore, Judgment } from "@pinecall/protocol";

// The mark a verdict wears. `held` and `broken` are the two the matrix draws too, so they are
// defined here once and imported there: one glyph, one meaning, wherever a verdict is printed.
export const HELD = "✓";
export const BROKEN = "✗";
const DEFERRED = "?";
const SKIPPED = "·";

// livekit's three verdicts said in ours, plus the fourth that is ours alone. See scoring.md.
const MARK: Record<string, string> = {
  held: HELD,
  broken: BROKEN,
  deferred: DEFERRED,
  skipped: SKIPPED,
};

// `passed` means no judge answered broken, which is the answer to a question somebody asked. A
// call nobody asked about has NO answer: the field is absent, and absent is a third thing that
// must read as neither green nor red. The runtime's docs/decisions/scoring.md says so, and this
// line is that.
const NOBODY_JUDGED = "nobody judged this call";

const NO_REASON = "no reason was written down";

/** The sentence a judge or a graph wrote when it decided. A hard policy writes the seqs for free. */
export function reasonOf(said: { reason: string }): string {
  return said.reason === "" ? NO_REASON : said.reason;
}

/** The score as the terminal prints it: the headline, a line per judge, then what it cost. */
export function linesOfScore(score: CallScore): string[] {
  return [headline(score), ...score.judges.map(oneJudge), costLine(score)];
}

// The one line read first. Three states and never two: held, broken, or nobody looked — and when
// nobody looked, the reason the entry carries is printed rather than a verdict invented for it.
function headline(score: CallScore): string {
  if (score.passed === undefined || score.passed === null) {
    return `${SKIPPED} ${NOBODY_JUDGED}: ${score.not_judged ?? "the entry says nothing about why"}`;
  }
  return `${score.passed ? HELD : BROKEN} ${score.passed ? "every judge held" : "a judge answered broken"}`;
}

// One judge: its mark, its name, the sentence it wrote, and the seqs that sentence named — which
// are what a person opens the log at to disagree with it.
function oneJudge(judgment: Judgment): string {
  const seqs = judgment.evidence.seqs;
  const at = seqs.length === 0 ? "" : `  [seq ${seqs.join(", ")}]`;
  return `  ${MARK[judgment.verdict] ?? SKIPPED} ${judgment.name.padEnd(10)} ${reasonOf(judgment)}${at}`;
}

// What judging cost: the count of questions that actually reached a model, and the bill when one
// could be priced. An unknown bill is left unsaid rather than printed as a zero — a model nobody
// reported tokens for has no price, not a free one.
function costLine(score: CallScore): string {
  const asked = score.judge_calls;
  const priced =
    score.judge_cost_eur === undefined || score.judge_cost_eur === null
      ? ""
      : ` · ${score.judge_cost_eur.toFixed(4)} EUR`;
  return `  ${asked} judge call${asked === 1 ? "" : "s"}${priced}`;
}
