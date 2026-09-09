/** The framework's own words: the standing rules and the protocols, in the agent's `language`. */

/** The two blocks the framework contributes to every prompt, in one language. */
export interface Words {
  rules: string;
  protocols: string;
}

// These are the framework's words, identical for every agent and every turn of a call, which is
// exactly why they belong in the cached region — and why they are a table and not a template.
const WORDS: Record<string, Words> = {
  es: {
    rules: [
      "- No inventes ningún dato: lo que no salga de una herramienta o del conocimiento, no lo digas.",
      "- Una sola pregunta por turno, y espera la respuesta.",
      "- Habla como una persona al teléfono: frases cortas, sin listas ni markdown.",
    ].join("\n"),
    protocols: [
      "- Para actuar usa una herramienta; decir que has hecho algo no lo hace.",
      "- Antes de una acción irreversible lee en voz alta lo que vas a hacer y espera un sí explícito.",
      "- Si no puedes resolverlo, dilo y ofrece pasar con una persona.",
    ].join("\n"),
  },
  en: {
    rules: [
      "- Invent nothing: if it did not come from a tool or from the knowledge, do not say it.",
      "- One question per turn, and wait for the answer.",
      "- Talk like a person on the phone: short sentences, no lists, no markdown.",
    ].join("\n"),
    protocols: [
      "- To act, call a tool; saying you have done something does not do it.",
      "- Before an irreversible action read back what you are about to do and wait for an explicit yes.",
      "- If you cannot solve it, say so and offer to hand over to a person.",
    ].join("\n"),
  },
};

/** The default language, and the one an unknown `language` falls back to. */
export const DEFAULT_LANGUAGE = "es";

/**
 * The framework's words for this agent: `language` is a config field, so it is read off the
 * instance and never off the state. A language we do not speak yet falls back to the default
 * rather than leaving the model with no rules at all.
 */
export function wordsFor(agent: object): Words {
  const configured = (agent as { language?: string }).language;
  const code = (configured ?? DEFAULT_LANGUAGE).toLowerCase().split(/[-_]/)[0] ?? DEFAULT_LANGUAGE;
  return WORDS[code] ?? WORDS[DEFAULT_LANGUAGE]!;
}

/** The languages the framework has words for, for a test that wants to walk them all. */
export function languages(): string[] {
  return Object.keys(WORDS);
}
