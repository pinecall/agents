/** Every operator door this page opens, and the shape each answers: one file, one contract. */

import { z } from "zod";

import { drop, post, put, read, type Credentials } from "../../shared/api";

const OPS = "/v1/ops";

// The eight quotas, spelled once and in the runtime's own order (types/org.py). Four are a FLOW —
// what the org has consumed or holds open — and four a STOCK, what it may keep standing. `null`
// is no limit, which is what a box of its own gives everybody; `0` is a real limit that refuses.
export const QUOTAS = [
  "minutes",
  "messages",
  "agents",
  "concurrent_calls",
  "memory_facts",
  "knowledge_chunks",
  "numbers",
  "seats",
] as const;

/** One quota's name, as the gateway spells it and as a flag of the runtime's CLI spells it. */
export type Quota = (typeof QUOTAS)[number];

const aLimit = z.number().nullable();
const QuotasSchema = z.object({
  minutes: aLimit,
  messages: aLimit,
  agents: aLimit,
  concurrent_calls: aLimit,
  memory_facts: aLimit,
  knowledge_chunks: aLimit,
  numbers: aLimit,
  seats: aLimit,
});

// What the org is HOLDING against the stocks, counted by query at the moment it is asked. The
// gateway answers only the four it can count; a key that opens a gateway with no database reads
// zeros, which is what a box with no tables holds.
const HoldingSchema = z.object({
  memory_facts: z.number(),
  knowledge_chunks: z.number(),
  numbers: z.number(),
  seats: z.number(),
});

const OrgSchema = z.object({ id: z.string(), slug: z.string(), name: z.string() });

const OneOrgSchema = OrgSchema.extend({
  quotas: QuotasSchema,
  holding: HoldingSchema,
});

const ListedKeySchema = z.object({
  fingerprint: z.string(),
  org: z.string(),
  label: z.string().nullable(),
  created_at: z.string(),
  revoked_at: z.string().nullable(),
  env: z.string(),
  scopes: z.array(z.string()),
  subject: z.string().nullable(),
  name: z.string().nullable(),
});

const MemberSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  role: z.string(),
  agents: z.array(z.string()),
  status: z.string(),
  scopes: z.array(z.string()),
});

const RouteSchema = z.object({
  route: z.object({
    org: z.string(),
    agent: z.string(),
    channel: z.string(),
    number: z.string().nullable(),
    label: z.string().nullable(),
    env: z.string(),
    managed: z.boolean(),
  }),
  source: z.string(),
});

// The hub's own Seat (runtime fleet/roster.py), as it dumps it. `max_jobs` is null for a worker
// that never said its ceiling; `load` is what the SFU reads to stop routing, and `seen_at` is a
// wall clock the page reads against the `now` the same answer carries.
const WorkerSchema = z.object({
  worker: z.string(),
  active: z.number(),
  max_jobs: z.number().nullable(),
  load: z.number(),
  draining: z.boolean(),
  cordoned: z.boolean(),
  seen_at: z.number(),
});

const UsageRowSchema = z.object({
  cursor: z.number(),
  org: z.string(),
  agent: z.string(),
  call: z.string(),
  type: z.string(),
  at: z.number(),
  minutes: z.number(),
  messages: z.number(),
  input_tokens: z.number(),
  output_tokens: z.number(),
  characters: z.number(),
  judge_calls: z.number(),
  cost_eur: z.number(),
});

/** One tenant as the listing shows it. */
export type Org = z.infer<typeof OrgSchema>;
/** One tenant with what it may do and what it is holding. */
export type OneOrg = z.infer<typeof OneOrgSchema>;
/** One API key by its fingerprint. A key itself is never behind any of these doors. */
export type ListedKey = z.infer<typeof ListedKeySchema>;
/** One person of an org, as the operator reads them: never a password, never a token. */
export type Member = z.infer<typeof MemberSchema>;
/** One door the fleet answers at, and which table put it there. */
export type Answering = z.infer<typeof RouteSchema>;
/** One worker of the fleet. */
export type Worker = z.infer<typeof WorkerSchema>;
/** One metered entry of the log, as the projection folds it. */
export type UsageRow = z.infer<typeof UsageRowSchema>;

// ── the tenants ─────────────────────────────────────────────────────────────────

/** Every org this box serves, oldest first: the default one is always the first line. */
export async function orgs(credentials: Credentials): Promise<Org[]> {
  return z.array(OrgSchema).parse(await read(credentials, `${OPS}/orgs`));
}

/** One org by id or slug, with its quotas and what it holds against the stocks. */
export async function oneOrg(credentials: Credentials, named: string): Promise<OneOrg> {
  return OneOrgSchema.parse(await read(credentials, `${OPS}/orgs/${encodeURIComponent(named)}`));
}

/** Replace the org's limits, whole: a limit left out is no limit, and the door says so back. */
export async function setQuotas(
  credentials: Credentials,
  named: string,
  wanted: Partial<Record<Quota, number | null>>,
): Promise<void> {
  await put(credentials, `${OPS}/orgs/${encodeURIComponent(named)}/quotas`, wanted);
}

/** A new tenant. The id is minted by the gateway and is what every row of theirs will name. */
export async function addOrg(credentials: Credentials, slug: string, name: string): Promise<Org> {
  return OrgSchema.parse(await post(credentials, `${OPS}/orgs`, { slug, name: name || null }));
}

/** Every key of one org, by fingerprint, revoked ones named as revoked. */
export async function keysOf(credentials: Credentials, named: string): Promise<ListedKey[]> {
  const path = `${OPS}/orgs/${encodeURIComponent(named)}/keys`;
  return z.array(ListedKeySchema).parse(await read(credentials, path));
}

/** Stop one key from the next request. Its row, and the calls it wrote, stay. */
export async function revokeKey(credentials: Credentials, fingerprint: string): Promise<void> {
  await post(credentials, `${OPS}/keys/${encodeURIComponent(fingerprint)}/revoke`, {});
}

/** The org's people and how many of them hold a seat. Read-only: who works there is theirs. */
export async function membersOf(
  credentials: Credentials,
  named: string,
): Promise<{ members: Member[]; seated: number }> {
  const path = `${OPS}/orgs/${encodeURIComponent(named)}/members`;
  const said = await read(credentials, path);
  return z.object({ members: z.array(MemberSchema), seated: z.number() }).parse(said);
}

/** Which vendors this org brought its own key for. Never a value, here or anywhere. */
export async function vendorsOf(credentials: Credentials, named: string): Promise<string[]> {
  const path = `${OPS}/orgs/${encodeURIComponent(named)}/provider-keys`;
  return z.object({ vendors: z.array(z.string()) }).parse(await read(credentials, path)).vendors;
}

/** Give a vendor back to the box's own key for this org, from the next call. */
export async function forgetVendor(
  credentials: Credentials,
  named: string,
  vendor: string,
): Promise<void> {
  await drop(credentials, `${OPS}/orgs/${encodeURIComponent(named)}/provider-keys/${vendor}`);
}

// ── the doors and the fleet ─────────────────────────────────────────────────────

/** Every door one org answers in one world, each saying which table put it there. */
export async function routesOf(
  credentials: Credentials,
  org: string,
  env: string,
): Promise<Answering[]> {
  return z.array(RouteSchema).parse(await read(credentials, `${OPS}/routes`, { org, env }));
}

/** The fleet as the hub answers it: its clock, how long a silence counts as gone, the workers. */
export interface TheFleet {
  now: number;
  stale_after_s: number;
  workers: Worker[];
}

/** Every worker the hub has heard from, with what it is carrying, and the hub's own clock. */
export async function fleet(credentials: Credentials): Promise<TheFleet> {
  const said = await read(credentials, `${OPS}/fleet`);
  return z
    .object({ now: z.number(), stale_after_s: z.number(), workers: z.array(WorkerSchema) })
    .parse(said);
}

/** Stop giving a worker new calls, or start again. The calls it holds are never touched. */
export async function cordon(
  credentials: Credentials,
  worker: string,
  wanted: boolean,
): Promise<void> {
  const path = `${OPS}/fleet/${encodeURIComponent(worker)}/cordon`;
  if (wanted) {
    await post(credentials, path, {});
    return;
  }
  await drop(credentials, path);
}

/** What one org has consumed over the rows of a page: the same sum the projection folds. */
const TotalsSchema = z.object({
  minutes: z.number(),
  messages: z.number(),
  input_tokens: z.number(),
  output_tokens: z.number(),
  characters: z.number(),
});

/** The totals of a page, per org. */
export type Totals = z.infer<typeof TotalsSchema>;

/**
 * A page of the metered rows, oldest first, with the per-org totals and the cursor to resume from.
 *
 * The cursor moves past every row READ and not every row returned, so a page whose rows were all
 * another org's still makes progress; `next` is null at the end.
 */
export async function usage(
  credentials: Credentials,
  after: number,
  limit: number,
): Promise<{ rows: UsageRow[]; totals: Record<string, Totals>; next: number | null }> {
  const said = await read(credentials, `${OPS}/usage`, { after, limit });
  return z
    .object({
      rows: z.array(UsageRowSchema),
      totals: z.record(z.string(), TotalsSchema),
      next: z.number().nullable(),
    })
    .parse(said);
}
