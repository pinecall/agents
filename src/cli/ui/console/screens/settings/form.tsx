/** The whole set on one form: the vendors and models, the opening, the cut of a turn, what is remembered. */

import { useState, type FormEvent, type ReactNode } from "react";

import type { TuningBody } from "@pinecall/protocol";

import { doing, type Modality, type Provider } from "../../lib/catalogue";
import { Button, Input, Label, Select, TextArea } from "../../ui";

// The three stages in the order a turn passes through them, each a vendor from the list the
// gateway answered with and a model beside it; a vendor this box cannot run stays on the list,
// marked, because hiding it would leave a person wondering why the vendor they pay for is not there.
const STAGES = [
  { field: "stt", modality: "stt", label: "Hears with", note: "Which ear hears the caller. A model beside it when the vendor's own default is not wanted." },
  { field: "llm", modality: "llm", label: "Decides with", note: "What reads the words and answers." },
  { field: "tts", modality: "tts", label: "Speaks with", note: "What says it out loud. The voice is then that vendor's own id, unless the vendor is the one this build curates voices for." },
] as const satisfies readonly { field: "stt" | "llm" | "tts"; modality: Modality; label: string; note: string }[];

const CURATED = "elevenlabs";

/** What a person types, as the form keeps it: every field a string, lists one line each. */
export interface Typed {
  voice: string;
  tts: string;
  tts_model: string;
  stt: string;
  llm: string;
  say: string;
  reply: string;
  hangup: string;
  endpointing_ms: string;
  min_interruption_words: string;
  remember: string;
  forget: string;
  knowledge: string;
  note: string;
}

/** The form's fields off a config: what the corner set, ready to be edited. */
export function typedOf(config: TuningBody): Typed {
  const turn = config.turn ?? undefined;
  const memory = config.memory ?? undefined;
  return {
    voice: config.voice ?? "",
    tts: config.tts ?? "",
    tts_model: config.tts_model ?? "",
    stt: config.stt ?? "",
    llm: config.llm ?? "",
    say: config.greeting?.say ?? "",
    reply: config.greeting?.reply ?? "",
    hangup: config.hangup?.when ?? "",
    endpointing_ms: typeof turn?.endpointing_ms === "number" ? String(turn.endpointing_ms) : "",
    min_interruption_words: typeof turn?.min_interruption_words === "number" ? String(turn.min_interruption_words) : "",
    remember: (memory?.remember ?? []).join("\n"),
    forget: (memory?.forget ?? []).join("\n"),
    knowledge: (config.knowledge ?? []).map((one) => (typeof one.k === "number" ? `${one.base} ${one.k}` : one.base)).join("\n"),
    note: "",
  };
}

// The body is the whole set: a field left empty is not sent, which is what gives it back to the
// class, or the runtime's default. An empty string is never sent — the door refuses one.
/** The config a form sends, whole, off what is on screen. */
export function configOf(typed: Typed, wordsOnly: boolean, standing: TuningBody): TuningBody {
  const config: TuningBody = wordsOnly ? { ...standing } : {};
  const word = (field: "voice" | "tts" | "tts_model" | "stt" | "llm"): void => {
    if (wordsOnly) return;
    const value = typed[field].trim();
    if (value !== "") config[field] = value;
  };
  word("voice");
  word("tts");
  word("tts_model");
  word("stt");
  word("llm");
  const say = typed.say.trim();
  const reply = typed.reply.trim();
  if (say !== "") config.greeting = { say };
  else if (reply !== "" && !wordsOnly) config.greeting = { reply };
  else delete config.greeting;
  const remember = lines(typed.remember);
  const forget = lines(typed.forget);
  if (remember.length > 0 || forget.length > 0) config.memory = { remember, forget };
  else delete config.memory;
  if (!wordsOnly) {
    const hangup = typed.hangup.trim();
    if (hangup !== "") config.hangup = { when: hangup };
    const turn: NonNullable<TuningBody["turn"]> = {};
    if (typed.endpointing_ms.trim() !== "") turn.endpointing_ms = Number(typed.endpointing_ms);
    if (typed.min_interruption_words.trim() !== "") turn.min_interruption_words = Number(typed.min_interruption_words);
    if (Object.keys(turn).length > 0) config.turn = turn;
    const bases = lines(typed.knowledge).map((line) => {
      const [base, k] = line.split(/\s+/);
      return k === undefined ? { base: base ?? "" } : { base: base ?? "", k: Number(k) };
    });
    if (bases.length > 0) config.knowledge = bases;
  }
  return config;
}

function lines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

export function SettingsForm({
  standing,
  version,
  wordsOnly,
  voices,
  providers,
  saving,
  error,
  onSave,
}: {
  standing: TuningBody;
  /** The version this form was opened at: what the save is checked against. */
  version: number | null;
  /** A key that opens words and not the pipeline: the opening and the memory, and nothing else on screen. */
  wordsOnly: boolean;
  voices: readonly string[];
  providers: readonly Provider[];
  saving: boolean;
  error: string | null;
  onSave: (config: TuningBody, ifVersion: number | null, note: string | null) => Promise<void>;
}): ReactNode {
  const [typed, setTyped] = useState<Typed>(() => typedOf(standing));
  const [saved, setSaved] = useState(false);
  const change = (field: keyof Typed, value: string): void => {
    setSaved(false);
    setTyped({ ...typed, [field]: value });
  };
  const ttsNames = new Set(doing(providers, "tts").map((one) => one.name));
  const speaking = vendorOf(typed.tts, ttsNames) || CURATED;

  const save = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    await onSave(configOf(typed, wordsOnly, standing), version, typed.note.trim() === "" ? null : typed.note.trim());
    setSaved(true);
  };

  return (
    <form className="ui-card" onSubmit={(event) => void save(event)}>
      <div className="ui-card-head">
        <span className="ui-card-title">Set</span>
        <span className="ui-card-meta">{version === null ? "the first version of this corner" : `over v${version} — a corner that moved since is told so, never written over`}</span>
      </div>
      <div className="set-grid">
        {!wordsOnly &&
          STAGES.map((stage) => (
            <div className="set-field" key={stage.field}>
              <Label>{stage.label}</Label>
              <Stage value={typed[stage.field]} offered={doing(providers, stage.modality)} onChange={(asked) => change(stage.field, asked)} />
              <p className="pipe-note">{stage.note}</p>
            </div>
          ))}
        {!wordsOnly && (
          <div className="set-field">
            <Label>Voice</Label>
            {speaking === CURATED ? (
              <Select value={typed.voice} onChange={(event) => change("voice", event.target.value)}>
                <option value="">as the class declares</option>
                {(voices.includes(typed.voice) || typed.voice === "" ? voices : [typed.voice, ...voices]).map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </Select>
            ) : (
              <Input value={typed.voice} spellCheck={false} placeholder={`${speaking}'s own voice id`} onChange={(event) => change("voice", event.target.value)} />
            )}
            <Input value={typed.tts_model} spellCheck={false} placeholder="tts model, when the vendor's default is not wanted" onChange={(event) => change("tts_model", event.target.value)} />
          </div>
        )}
        <div className="set-field set-field-wide">
          <Label>Greeting</Label>
          <TextArea value={typed.say} rows={2} placeholder="the words said as the call opens, verbatim" onChange={(event) => change("say", event.target.value)} />
          {!wordsOnly && <TextArea value={typed.reply} rows={2} placeholder="or: what the model reads before it finds its own opening" onChange={(event) => change("reply", event.target.value)} />}
          <p className="pipe-note">One of the two: the words themselves, or an instruction. Words also stop a class that improvises its opening.</p>
        </div>
        {!wordsOnly && (
          <div className="set-field set-field-wide">
            <Label>Hangup</Label>
            <Input value={typed.hangup} placeholder="when the model may end the call, in your words" onChange={(event) => change("hangup", event.target.value)} />
          </div>
        )}
        {!wordsOnly && (
          <div className="set-field">
            <Label>Turn</Label>
            <Input value={typed.endpointing_ms} inputMode="numeric" placeholder="endpointing, ms" onChange={(event) => change("endpointing_ms", event.target.value)} />
            <Input value={typed.min_interruption_words} inputMode="numeric" placeholder="words before an interruption counts" onChange={(event) => change("min_interruption_words", event.target.value)} />
          </div>
        )}
        <div className="set-field">
          <Label>Remember</Label>
          <TextArea value={typed.remember} rows={3} placeholder="what to keep about a caller, one line each" onChange={(event) => change("remember", event.target.value)} />
        </div>
        <div className="set-field">
          <Label>Never keep</Label>
          <TextArea value={typed.forget} rows={3} placeholder="what is never written down, one line each" onChange={(event) => change("forget", event.target.value)} />
        </div>
        {!wordsOnly && (
          <div className="set-field">
            <Label>Knowledge</Label>
            <TextArea value={typed.knowledge} rows={2} placeholder={"bases the agent reads, one per line: name, and k after a space"} onChange={(event) => change("knowledge", event.target.value)} />
          </div>
        )}
        <div className="set-field set-field-wide">
          <Label>Note</Label>
          <Input value={typed.note} placeholder="why, for the history" onChange={(event) => change("note", event.target.value)} />
        </div>
      </div>
      <div className="pipe-save">
        <Button kind="primary" size="form" type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save as the next version"}
        </Button>
        {error !== null ? <span className="pipe-save-error">{error}</span> : saved ? <span className="pipe-save-note">Kept. The corners above are the gateway's answer.</span> : <span className="pipe-save-note">An empty field gives it back to what the class declares.</span>}
      </div>
    </form>
  );
}

// A knob is one string — `cartesia`, `cartesia/sonic-3`, or a bare model on the vendor in use — and
// the control is two boxes over that one string.
function vendorOf(value: string, names: ReadonlySet<string>): string {
  const at = value.lastIndexOf("/");
  if (at >= 0) return value.slice(0, at);
  return names.has(value) ? value : "";
}

function modelOf(value: string, names: ReadonlySet<string>): string {
  const at = value.lastIndexOf("/");
  if (at >= 0) return value.slice(at + 1);
  return names.has(value) ? "" : value;
}

function asOneString(vendor: string, model: string): string {
  if (vendor === "") return model;
  return model === "" ? vendor : `${vendor}/${model}`;
}

function Stage({ value, offered, onChange }: { value: string; offered: readonly Provider[]; onChange: (asked: string) => void }): ReactNode {
  const names = new Set(offered.map((one) => one.name));
  const vendor = vendorOf(value, names);
  const model = modelOf(value, names);
  return (
    <div className="set-stage">
      <Select value={vendor} onChange={(event) => onChange(asOneString(event.target.value, model))}>
        <option value="">as the class declares</option>
        {offered.map((one) => (
          <option key={one.name} value={one.name}>
            {one.name}
            {one.ready ? "" : ` — ${one.standing}`}
          </option>
        ))}
      </Select>
      <Input value={model} spellCheck={false} placeholder="the vendor's own default model" onChange={(event) => onChange(asOneString(vendor, event.target.value))} />
    </div>
  );
}
