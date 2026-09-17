/** A day at a glance, as the gateway counts it off its call index; null from a gateway that does not count yet. */

import { useEffect, useState } from "react";
import { z } from "zod";

import { GatewayError, read } from "../../shared/api";
import { useCredentials } from "../../shared/credentials";

// GET /v1/insights (the runtime's docs/protocol/console-api.md §2). The day is cut in UTC, like
// every clock of this console. Read loosely: a field the gateway adds later is not a refusal.
const InsightsSchema = z.looseObject({
  day: z.string(),
  conversations: z.object({ today: z.number(), yesterday: z.number() }),
  resolved_rate: z.number().nullable(),
  median_e2e_s: z.number().nullable(),
  spend_eur: z.number(),
  channels: z.object({ phone: z.number(), web: z.number(), whatsapp: z.number() }),
  sessions_total: z.number(),
  live: z.number(),
  agents: z.array(z.object({ slug: z.string(), today: z.number(), score: z.number().nullable() })),
  budget: z.object({ limit_eur: z.number().nullable(), spent_eur_month: z.number() }),
});
export type Insights = z.infer<typeof InsightsSchema>;

// Counted off an index, so asking again is cheap; the floor's own clock is 3 s, and a day's numbers
// do not need to move that fast.
const EVERY_MS = 15000;

/** Today's numbers, re-read every few seconds. Null until they arrive, and for good from a gateway with no such door. */
export function useInsights(day?: string): Insights | null {
  const credentials = useCredentials();
  const [insights, setInsights] = useState<Insights | null>(null);

  useEffect(() => {
    let stopped = false;
    let again: number | undefined;
    const ask = async (): Promise<void> => {
      try {
        const answered = InsightsSchema.parse(await read(credentials, "/v1/insights", day === undefined ? {} : { day }));
        if (!stopped) setInsights(answered);
      } catch (refused) {
        // A gateway without the door, or a key that may not read calls: nothing to count, and no
        // reason to keep knocking.
        if (refused instanceof GatewayError && [403, 404].includes(refused.status)) {
          window.clearInterval(again);
          if (!stopped) setInsights(null);
        }
      }
    };
    void ask();
    again = window.setInterval(() => void ask(), EVERY_MS);
    return () => {
      stopped = true;
      window.clearInterval(again);
    };
  }, [credentials, day]);

  return insights;
}
