/** The Usage screen's one door: the org's metered rows and totals, in the runtime's own field names. */

import { z } from "zod";

import { read, type Credentials } from "../../lib/api";

// The runtime's log/usage.py, field for field: UsageRow and Totals. Nothing is renamed here.
const RowSchema = z.object({
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
export type UsageRow = z.infer<typeof RowSchema>;

const TotalsSchema = z.object({
  minutes: z.number(),
  messages: z.number(),
  input_tokens: z.number(),
  output_tokens: z.number(),
  characters: z.number(),
  judge_calls: z.number(),
  cost_eur: z.number(),
  calls: z.number(),
});
export type Totals = z.infer<typeof TotalsSchema>;

const UsageSchema = z.object({ rows: z.array(RowSchema), totals: TotalsSchema.nullable(), next: z.number().nullable() });
export type UsagePage = z.infer<typeof UsageSchema>;

/** One page of the org's metered rows above the cursor, with its totals and where to resume. */
export async function readUsage(credentials: Credentials, after = 0): Promise<UsagePage> {
  return UsageSchema.parse(await read(credentials, "/v1/usage", { after }));
}
