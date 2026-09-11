/** The envelope `GET /v1/evals/runs` answers in, and the one entry a scored call is read by. */

import { z } from "zod";

import { post, read, type Credentials } from "../../lib/api";

// The shapes are read here and nowhere else in the console, the way screens/pipeline/door.ts holds
// the ones its own door wraps: `protocol/schema` describes a call, not an operator's screen.
/** One golden under one model, and the call it opened — so its log is readable on its own. */
const OpenedSchema = z.object({
  golden: z.string(),
  model: z.string(),
  call: z.string(),
});

// Ring 3's own vocabulary, and deliberately not ring 4's four words: a check's status is the
// operator's and a verdict on the wire is the tenant's (the runtime's docs/decisions/scoring.md).
// `score` is livekit's arithmetic over a judgment, shown as the judgment wrote it, never averaged.
/** What one judge answered about one golden: the number, the sentence, and what it was asked. */
const JudgedSchema = z.object({
  metric: z.string(),
  score: z.number(),
  passed: z.boolean(),
  reason: z.string(),
  criteria: z.string(),
  judge_calls: z.int(),
});
export type Judged = z.infer<typeof JudgedSchema>;

/** One cell: a golden under a model, every judge's answer, and the call's own summary beside it. */
const CellSchema = z.object({
  model: z.string(),
  golden: z.string(),
  scores: z.array(JudgedSchema),
  summary: z.record(z.string(), z.unknown()).nullable(),
});
export type Cell = z.infer<typeof CellSchema>;

/** The table the run finished with: the two axes, the judges that answered, and every cell. */
const MatrixSchema = z.object({
  models: z.array(z.string()),
  goldens: z.array(z.string()),
  metrics: z.array(z.string()),
  judge_calls: z.int(),
  runs: z.array(CellSchema),
  failures: z.array(z.object({ model: z.string(), golden: z.string(), metric: z.string() })),
});
export type Matrix = z.infer<typeof MatrixSchema>;

/** One run of a suite: when it started, which calls it opened, and what the judges answered. */
const EvalRunSchema = z.object({
  id: z.string(),
  agent: z.string(),
  started_at: z.number(),
  finished_at: z.number().nullable(),
  // `failed` is the run failing, never a golden failing — a golden that did not hold is a score.
  status: z.enum(["running", "done", "failed"]),
  calls: z.array(OpenedSchema),
  matrix: MatrixSchema.nullable(),
  error: z.string().nullable(),
});
export type EvalRun = z.infer<typeof EvalRunSchema>;

/** Every run this gateway has done, newest first. */
const EvalRunListSchema = z.object({ runs: z.array(EvalRunSchema) });

// The door's own ceiling (the runtime's api/evals/runs.py). It narrows by
// agent itself, so the ceiling counts THIS agent's runs and a busy fleet never pushes an older
// one of them off the end of the page — see docs/decisions/evals-screen.md.
const AS_MANY_AS_IT_MAY = 200;

/** The runs of ONE agent, newest first. No other agent's run is ever in the answer. */
export async function readRuns(credentials: Credentials, agent: string): Promise<EvalRun[]> {
  const listed = EvalRunListSchema.parse(
    await read(credentials, "/v1/evals/runs", { agent, limit: AS_MANY_AS_IT_MAY }),
  );
  return listed.runs;
}

// ── what a run came to afterwards ───────────────────────────────────────────────

/** One judge's standing in one window: how many verdicts settled, and how many of them held. */
const RateSchema = z.object({ held: z.int(), settled: z.int(), percent: z.number() });

/** One judge across the two windows, and the points between them. Null is silence, never zero. */
const JudgeDriftSchema = z.object({
  judge: z.string(),
  before: RateSchema.nullable(),
  now: RateSchema.nullable(),
  delta: z.number().nullable(),
});
export type JudgeDrift = z.infer<typeof JudgeDriftSchema>;

/** One broken verdict, as a reader opens the log at it: the call, the judge, the seqs, the why. */
const BrokeSchema = z.object({
  call: z.string(),
  judge: z.string(),
  seqs: z.array(z.int()),
  reason: z.string(),
});

/** What drift came to: a row per judge, what nobody judged, the newest calls that broke, the worst drop. */
const DriftedSchema = z.object({
  agent: z.string(),
  window: z.number(),
  baseline: z.number(),
  threshold: z.number(),
  drift: z.object({
    judges: z.array(JudgeDriftSchema),
    notJudged: z.object({ now: z.int(), before: z.int() }),
    broke: z.array(BrokeSchema),
    worst: z.number().nullable(),
  }),
});
export type Drifted = z.infer<typeof DriftedSchema>;

// The two hundred calls and their scores are read by the process that holds the key, not by this
// page: it is the very `theDrift` `pinecall runs drift` runs, and a browser would make two
// hundred round trips to do it.
/** Each judge's held-rate over two windows, and the points between them. */
export async function readDrift(
  credentials: Credentials,
  agent: string,
  window: number,
  baseline: number,
): Promise<Drifted> {
  return DriftedSchema.parse(await post(credentials, "/ui/drift", { agent, window, baseline }));
}

/** One check of ring 3, as the replay door writes it: three strings and no nesting. */
const VerdictSchema = z.object({ check: z.string(), status: z.string(), detail: z.string() });

/** Ring 3 over one finished call: rebuilt from its log and answered by code, never by a model. */
const ReplayedSchema = z.object({
  call: z.string(),
  agent: z.string(),
  passed: z.boolean(),
  verdicts: z.array(VerdictSchema),
});
export type Replayed = z.infer<typeof ReplayedSchema>;

/** Re-evaluate one finished call with the runtime's four code checks. Nothing is re-run. */
export async function replayCall(credentials: Credentials, call: string): Promise<Replayed> {
  return ReplayedSchema.parse(await post(credentials, `/v1/evals/replay/${encodeURIComponent(call)}`, {}));
}

/** A call written down as a golden candidate: where the file landed, and what is a person's to decide. */
const PromotedSchema = z.object({
  path: z.string(),
  candidate: z.object({ name: z.string(), input: z.array(z.string()) }),
  notes: z.array(z.string()),
});
export type Promoted = z.infer<typeof PromotedSchema>;

/** Promote one real call to `test/candidates`, in the directory the console runs in. */
export async function promoteCall(credentials: Credentials, call: string): Promise<Promoted> {
  return PromotedSchema.parse(await post(credentials, "/ui/promote", { call }));
}
