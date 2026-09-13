/** The vendors this build runs, as both screens read them: the Providers list and the Pipeline knobs. */

import { z } from "zod";

import { read, type Credentials } from "../../shared/api";

// The runtime answers this shape at GET /v1/providers AND inside the pipeline report, built by the
// same function there (api/providers.py). It is described once here for the same reason: two
// screens that described it apart would drift the day a field is added.

/** One vendor as a screen needs it: what it does, what it is called, and what it still wants. */
export const ProviderSchema = z.object({
  name: z.string(),
  does: z.array(z.enum(["llm", "stt", "tts"])),
  aliases: z.array(z.string()),
  note: z.string(),
  installed: z.boolean(),
  keyed: z.boolean(),
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

// Three words, and only three: a vendor is ready, or it wants a plugin, or it wants a key. Said
// the same way in both screens, because the same operator reads both in the same minute.
export const READY = "ready";
export const NO_PLUGIN = "no plugin";
export const NO_KEY = "no key";

/** What state this box has a vendor in, in one word. `ready` is the only one that runs a call. */
export function standing(provider: Provider): string {
  if (!provider.installed) return NO_PLUGIN;
  if (!provider.keyed) return NO_KEY;
  return READY;
}

/** The vendors that can do one job, ready ones first, so a picker opens on something that works. */
export function doing(providers: readonly Provider[], modality: Modality): Provider[] {
  return providers
    .filter((provider) => provider.does.includes(modality))
    .sort((one, other) => Number(standing(other) === READY) - Number(standing(one) === READY) || one.name.localeCompare(other.name));
}

/** What a row says about itself under its name: what it is, and what it is still waiting for. */
export function said(provider: Provider): string {
  const state = standing(provider);
  if (state === NO_PLUGIN) return `needs livekit-agents[${provider.extra}] on the box`;
  if (state === NO_KEY) return provider.env === null ? "brings its own credentials" : `needs ${provider.env}`;
  return provider.note || "ready on this box";
}
