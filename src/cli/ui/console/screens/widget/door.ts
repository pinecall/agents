/** The Widget screen's door: how the widget presents this agent, kept by the gateway per org, world and agent. */

import { z } from "zod";

import { GatewayError, put, read, type Credentials } from "../../../shared/api";

// GET/PUT /v1/agents/{slug}/widget (the runtime's docs/protocol/console-api.md §7). A null is the
// widget's own default. The gateway keeps the set and injects nothing: the snippet this screen
// copies is where the words become attributes.
const SettingsSchema = z.object({
  title: z.string().nullable(),
  tagline: z.string().nullable(),
  greeting: z.string().nullable(),
  accent: z.string().nullable(),
  autostart: z.boolean(),
});
export type WidgetSettings = z.infer<typeof SettingsSchema>;

/** What is kept for this agent, or null from a gateway that keeps nothing yet (its 404). */
export async function readSettings(credentials: Credentials, agent: string): Promise<WidgetSettings | null> {
  try {
    return SettingsSchema.parse(await read(credentials, `/v1/agents/${encodeURIComponent(agent)}/widget`));
  } catch (refused) {
    if (refused instanceof GatewayError && refused.status === 404) return null;
    throw refused;
  }
}

/** Replace the whole set. */
export async function saveSettings(credentials: Credentials, agent: string, settings: WidgetSettings): Promise<WidgetSettings> {
  return SettingsSchema.parse(await put(credentials, `/v1/agents/${encodeURIComponent(agent)}/widget`, settings));
}
