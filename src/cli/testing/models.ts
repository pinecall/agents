/** The model `pinecall test --model` names, as the wire wants it: a short name, or `vendor/model`. */

import type { Camel, ModelConfig } from "@pinecall/protocol";

// `--model haiku` is how a person writes it, and the wire wants a provider and a real model id:
// "haiku" on its own is a 404 from Anthropic. The three short names are the family's tiers as the
// runtime prices them; anything else is passed through as written, with "provider/model" naming
// both halves and a bare name defaulting to Anthropic.
export const SHORT_NAMES: Record<string, string> = {
  haiku: "claude-haiku-4-5-20251001",
  sonnet: "claude-sonnet-5",
  opus: "claude-opus-5",
};

/** The model a name means, so `--model haiku` reaches the provider as an id it recognises. */
export function modelOf(value: string): Camel<ModelConfig> | undefined {
  if (value === "") return undefined;
  const [provider, name] = value.includes("/") ? value.split("/", 2) : ["anthropic", value];
  if (provider === "" || name === "") return undefined;
  return { provider: provider!, model: SHORT_NAMES[name!] ?? name! };
}

/**
 * The same name as a settings field wants it: one string, `vendor/model`. A short name is a tier
 * of Anthropic's family, so it travels with its vendor; anything else is what the person typed —
 * a vendor alone and a model alone are both what the gateway takes there, and prefixing either
 * would name a model nobody has. `agent set --llm haiku` used to store `anthropic/haiku`, which
 * is a 404 at the provider and nothing said so until a call went silent.
 */
export function theModelNamed(value: string): string | undefined {
  const model = modelOf(value);
  if (model === undefined) return undefined;
  return value.includes("/") || SHORT_NAMES[value] !== undefined ? `${model.provider}/${model.model}` : value;
}

// A short name is a tier, not a model: `--llm haiku` was stored as written and the gateway read a
// bare name as the vendor in use, so the corner held `anthropic/haiku` — a 404 at the provider,
// and no call said so. Every verb that takes `--llm` refuses a name that means no model in this
// one sentence: `agent set` for the agent, `personas add|edit` for a caller.
export const NOT_A_MODEL = (said: string): string =>
  `--llm ${said} names no model: vendor/model, a vendor alone, a model alone, ` +
  `or one of ${Object.keys(SHORT_NAMES).join(" · ")}`;
