/** The envelope `GET /v1/evals/runs` answers in, and the one entry a scored call is read by. */

import { z } from "zod";

import { read, type Credentials } from "../../lib/api";

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
