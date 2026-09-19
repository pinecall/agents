/** The model `pinecall test --model` names, as the wire wants it: a short name, or `vendor/model`. */

import type { Camel, ModelConfig } from "@pinecall/protocol";

// `--model haiku` is how a person writes it, and the wire wants a provider and a real model id:
// "haiku" on its own is a 404 from Anthropic. The three short names are the family's tiers as the
// runtime prices them; anything else is passed through as written, with "provider/model" naming
// both halves and a bare name defaulting to Anthropic.
const SHORT_NAMES: Record<string, string> = {
  haiku: "claude-haiku-4-5-20251001",
  sonnet: "claude-sonnet-5",
  opus: "claude-opus-5",
};

/** The model a name means, so `--model haiku` reaches the provider as an id it recognises. */
export function modelOf(value: string): Camel<ModelConfig> | undefined {
  if (value === "") return undefined;
  const [provider, name] = value.includes("/") ? value.split("/", 2) : ["anthropic", value];
  return { provider: provider!, model: SHORT_NAMES[name!] ?? name! };
}
