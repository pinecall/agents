/** The vendors this build runs, as both screens read them: the Providers list and the Pipeline knobs. */

import { z } from "zod";

import { read, type Credentials } from "../../shared/api";

// The runtime answers this shape at GET /v1/providers AND inside the pipeline report, built by the
// same function there (api/providers.py). It is described once here for the same reason: two
// screens that described it apart would drift the day a field is added.

// Three words, and only three, and the runtime picks which (providers/standing.py): a vendor is
// ready, or it wants a plugin, or it wants a key, or its credentials are its own arrangement —
// AWS's chain, RTZR's client pair, neither of them one string anybody could bring. The console
// combined the booleans itself once and called RTZR ready on a box that could not build it.
export const READY = "ready";
export const NO_PLUGIN = "no plugin";
export const NO_KEY = "no key";
export const ITS_OWN = "its own";

/** One vendor as a screen needs it: what it does, what it is called, and what it still wants. */
export const ProviderSchema = z.object({
  name: z.string(),
  does: z.array(z.enum(["llm", "stt", "tts"])),
  aliases: z.array(z.string()),
  note: z.string(),
  standing: z.enum([READY, NO_PLUGIN, NO_KEY, ITS_OWN]),
  ready: z.boolean(),
  env: z.string().nullable(),
  extra: z.string(),
});
export type Provider = z.infer<typeof ProviderSchema>;

export type Modality = Provider["does"][number];

export const MODALITIES = ["llm", "stt", "tts"] as const satisfies readonly Modality[];

/** What GET /v1/providers answers: the vendors, what runs when nobody chooses, the curated voices. */
export const CatalogueSchema = z.object({
  providers: z.array(ProviderSchema),
  defaults: z.record(z.string(), z.string()),
  voices: z.array(z.string()),
});
export type Catalogue = z.infer<typeof CatalogueSchema>;

/** Every vendor this build runs, with this box's state beside each one. */
export async function readCatalogue(credentials: Credentials): Promise<Catalogue> {
  return CatalogueSchema.parse(await read(credentials, "/v1/providers"));
}

/** The vendors that can do one job, ready ones first, so a picker opens on something that works. */
export function doing(providers: readonly Provider[], modality: Modality): Provider[] {
  return providers
    .filter((provider) => provider.does.includes(modality))
    .sort((one, other) => Number(other.ready) - Number(one.ready) || one.name.localeCompare(other.name));
}

/** What a row says about itself under its name: what it is, and what it is still waiting for. */
export function said(provider: Provider): string {
  if (provider.standing === NO_PLUGIN) return `the box needs livekit-agents[${provider.extra}]`;
  if (provider.standing === NO_KEY) return `the box needs ${provider.env ?? "a credential"}`;
  if (provider.standing === ITS_OWN) return "its credentials are its own: a profile, a pair, not one key";
  return provider.note || "ready on this box";
}
