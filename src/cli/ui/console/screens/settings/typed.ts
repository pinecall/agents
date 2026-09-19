/** The Settings form's state: every knob as a person picks it, and the whole set it becomes on the wire. */

import type { TuningBody } from "@pinecall/protocol";

export type Modality = "stt" | "llm" | "tts";

/** One model knob as two picks: the vendor, or none for the runtime's default; the model, or none for the vendor's own. */
export interface Knob {
  vendor: string;
  model: string;
}

/** What is on screen, as the form keeps it: every field a string, the lists one line each. */
export interface Typed {
  stt: Knob;
  llm: Knob;
  tts: Knob;
  voice: string;
  /** How the call opens: words said as they are, or an instruction the model opens from. */
  opening: "say" | "reply";
  say: string;
  reply: string;
  hangup: string;
  endpointing_ms: string;
  min_interruption_words: string;
  remember: string;
  forget: string;
  knowledge: string;
  bases: { base: string; k: string }[];
  note: string;
}

// A knob on the wire is one string in three forms — `cartesia`, `cartesia/sonic-3`, or a bare
// model on whichever vendor is in use — and the screen is two lists over that one string. A word
// that is not a vendor this box knows is a model.
/** The two picks a wire word means. */
export function knobOf(value: string | null | undefined, vendors: ReadonlySet<string>): Knob {
  if (value === null || value === undefined || value === "") return { vendor: "", model: "" };
  const at = value.lastIndexOf("/");
  if (at >= 0) return { vendor: value.slice(0, at), model: value.slice(at + 1) };
  return vendors.has(value) ? { vendor: value, model: "" } : { vendor: "", model: value };
}

/** The wire word two picks mean; empty when neither was picked. */
export function wordOf(knob: Knob): string {
  if (knob.vendor === "") return knob.model;
  return knob.model === "" ? knob.vendor : `${knob.vendor}/${knob.model}`;
}

/** The form's fields off a corner's config: what it set, ready to be edited. */
export function typedOf(config: TuningBody, vendors: ReadonlySet<string>): Typed {
  const turn = config.turn ?? undefined;
  const memory = config.memory ?? undefined;
  const tts = knobOf(config.tts, vendors);
  // `tts_model` is the older way to say the half after the slash, and it wins on the wire; the
  // form folds it into the one pick and never writes it back.
  const ttsModel = config.tts_model ?? undefined;
  const reply = config.greeting?.reply ?? "";
  return {
    stt: knobOf(config.stt, vendors),
    llm: knobOf(config.llm, vendors),
    tts: ttsModel === undefined || ttsModel === "" ? tts : { ...tts, model: ttsModel },
    voice: config.voice ?? "",
    opening: reply !== "" ? "reply" : "say",
    say: config.greeting?.say ?? "",
    reply,
    hangup: config.hangup?.when ?? "",
    endpointing_ms: typeof turn?.endpointing_ms === "number" ? String(turn.endpointing_ms) : "",
    min_interruption_words: typeof turn?.min_interruption_words === "number" ? String(turn.min_interruption_words) : "",
    remember: (memory?.remember ?? []).join("\n"),
    forget: (memory?.forget ?? []).join("\n"),
    knowledge: config.knowledge ?? "",
    bases: (config.bases ?? []).map((one) => ({ base: one.base, k: typeof one.k === "number" ? String(one.k) : "" })),
    note: "",
  };
}

// The body is the whole set: a field left empty is not sent, which gives it back to the runtime's
// default. An empty string is never sent — the door refuses one. A key that opens words and not
// the pipeline carries the corner's other fields over untouched and rewrites only its own three.
/** The config a form sends, whole, off what is on screen. */
export function configOf(typed: Typed, wordsOnly: boolean, standing: TuningBody): TuningBody {
  const config: TuningBody = wordsOnly ? { ...standing } : {};
  if (!wordsOnly) {
    for (const field of ["stt", "llm", "tts"] as const) {
      const word = wordOf(typed[field]);
      if (word !== "") config[field] = word;
    }
    const voice = typed.voice.trim();
    if (voice !== "") config.voice = voice;
    const hangup = typed.hangup.trim();
    if (hangup !== "") config.hangup = { when: hangup };
    const turn: NonNullable<TuningBody["turn"]> = {};
    if (typed.endpointing_ms.trim() !== "") turn.endpointing_ms = Number(typed.endpointing_ms);
    if (typed.min_interruption_words.trim() !== "") turn.min_interruption_words = Number(typed.min_interruption_words);
    if (Object.keys(turn).length > 0) config.turn = turn;
    const bases = typed.bases
      .filter((one) => one.base.trim() !== "")
      .map((one) => (one.k.trim() === "" ? { base: one.base.trim() } : { base: one.base.trim(), k: Number(one.k) }));
    if (bases.length > 0) config.bases = bases;
  }
  const say = typed.say.trim();
  const reply = typed.reply.trim();
  if (typed.opening === "say" && say !== "") config.greeting = { say };
  else if (typed.opening === "reply" && reply !== "" && !wordsOnly) config.greeting = { reply };
  else delete config.greeting;
  const remember = lines(typed.remember);
  const forget = lines(typed.forget);
  if (remember.length > 0 || forget.length > 0) config.memory = { remember, forget };
  else delete config.memory;
  if (typed.knowledge.trim() !== "") config.knowledge = typed.knowledge;
  else delete config.knowledge;
  return config;
}

function lines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
}
