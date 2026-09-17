/** The session list as this page reads it: the published protocol's lines, plus what a newer gateway adds to each. */

import { SessionLineSchema } from "@pinecall/protocol";
import { z } from "zod";

// The protocol this package depends on predates the score and flags a gateway now puts on each row,
// and its schemas are strict: a list read with them would be refused whole the day the gateway
// answered with more. So the page reads the lines extended here — every addition optional, which
// is also exactly what an older gateway answers — until the protocol that carries them is published.

/** How the judges answered at hang-up, cut to a row. */
export const SessionScoreSchema = z.object({
  held: z.number(),
  judged: z.number(),
  passed: z.boolean(),
  reason: z.string().nullable(),
});
export type SessionScore = z.infer<typeof SessionScoreSchema>;

/** What a person reviewing calls should look at first. */
export type SessionFlag = "escalated" | "low_score" | "promise";

export const LineSchema = SessionLineSchema.extend({
  score: SessionScoreSchema.nullish(),
  flags: z.array(z.string()).nullish(),
});
export type Line = z.infer<typeof LineSchema>;

/** One page of a sessions door, with the total and the cursor a newer gateway answers. */
export const LinesSchema = z.object({
  calls: z.array(LineSchema),
  total: z.number().nullish(),
  next: z.string().nullish(),
});
export type Lines = z.infer<typeof LinesSchema>;
