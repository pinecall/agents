/** The framework's built-in rules and protocols, per agent `language`. */

/** The rules and protocols blocks the framework adds to every prompt. */
export interface Words {
  rules: string;
  protocols: string;
}

// Constant across agents and turns, so they stay in the cached prompt prefix.
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

/** Default language, also used for unknown `language` values. */
export const DEFAULT_LANGUAGE = "es";

/** The built-in blocks for the agent's `language` config field, falling back to the default. */
export function wordsFor(agent: object): Words {
  const configured = (agent as { language?: string }).language;
  const code = (configured ?? DEFAULT_LANGUAGE).toLowerCase().split(/[-_]/)[0] ?? DEFAULT_LANGUAGE;
  return WORDS[code] ?? WORDS[DEFAULT_LANGUAGE]!;
}

/** Supported language codes. */

export function languages(): string[] {
  return Object.keys(WORDS);
}
