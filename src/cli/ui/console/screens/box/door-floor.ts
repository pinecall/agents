/** The box's doors about what is running: the fleet, the routes of an org, and what every org consumed. */

import { z } from "zod";

import { drop, post, read, type Credentials } from "../../../shared/api";

const OPS = "/v1/ops";

// The hub's own Seat (the runtime's fleet/roster.py). `max_jobs` is null for a worker that never
// said its ceiling; `seen_at` is a wall clock read against the `now` the same answer carries.
const WorkerSchema = z.looseObject({
  worker: z.string(),
  active: z.number(),
  max_jobs: z.number().nullish(),
  load: z.number(),
  draining: z.boolean(),
  cordoned: z.boolean(),
  seen_at: z.number(),
});
export type Worker = z.infer<typeof WorkerSchema>;

const FleetSchema = z.looseObject({ now: z.number(), stale_after_s: z.number(), workers: z.array(WorkerSchema) });
export type TheFleet = z.infer<typeof FleetSchema>;

const AnsweringSchema = z.looseObject({
  route: z.looseObject({
    agent: z.string(),
    channel: z.string(),
    number: z.string().nullish(),
    env: z.string(),
    managed: z.boolean().nullish(),
  }),
  source: z.string(),
});
export type Answering = z.infer<typeof AnsweringSchema>;

const UsageRowSchema = z.looseObject({
  cursor: z.number(),
  org: z.string(),
  agent: z.string(),
  call: z.string(),
  type: z.string(),
  at: z.number(),
  minutes: z.number(),
  messages: z.number(),
  cost_eur: z.number(),
});
export type UsageRow = z.infer<typeof UsageRowSchema>;

const TotalsSchema = z.looseObject({ minutes: z.number(), messages: z.number(), input_tokens: z.number(), output_tokens: z.number(), characters: z.number() });
export type Totals = z.infer<typeof TotalsSchema>;

const UsagePageSchema = z.looseObject({ rows: z.array(UsageRowSchema), totals: z.record(z.string(), TotalsSchema), next: z.number().nullish() });
export type UsagePage = z.infer<typeof UsagePageSchema>;

/** Every worker the hub has heard from, and the hub's own clock. */
export async function readFleet(credentials: Credentials): Promise<TheFleet> {
  return FleetSchema.parse(await read(credentials, `${OPS}/fleet`));
}

/** Stop giving a worker new calls, or start again. The calls it holds are never touched. */
export async function cordon(credentials: Credentials, worker: string, wanted: boolean): Promise<void> {
  const path = `${OPS}/fleet/${encodeURIComponent(worker)}/cordon`;
  await (wanted ? post(credentials, path, {}) : drop(credentials, path));
}

/** Every door one org answers at in one world, each saying which table put it there. */
export async function readRoutes(credentials: Credentials, org: string, env: string): Promise<Answering[]> {
  return z.array(AnsweringSchema).parse(await read(credentials, `${OPS}/routes`, { org, env }));
}

/** Type a number to an agent, or move it. The answer names the agent it was taken from, if any. */
export async function addRoute(
  credentials: Credentials,
  wanted: { org: string; number: string; agent: string; channel: string; env: string },
): Promise<string | null> {
  return z.looseObject({ overrides: z.string().nullish() }).parse(await post(credentials, `${OPS}/routes`, wanted)).overrides ?? null;
}

/** Forget a typed number. One nobody typed is a 404, so a typo is never a quiet success. */
export async function removeRoute(credentials: Credentials, org: string, number: string): Promise<void> {
  await drop(credentials, `${OPS}/routes/${encodeURIComponent(number)}?org=${encodeURIComponent(org)}`);
}

/** A page of the metered rows, oldest first, the totals per org, and the cursor to read on from. */
export async function readUsage(credentials: Credentials, after: number, limit: number): Promise<UsagePage> {
  return UsagePageSchema.parse(await read(credentials, `${OPS}/usage`, { after, limit }));
}
