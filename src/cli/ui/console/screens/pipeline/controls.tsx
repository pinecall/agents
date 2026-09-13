/** The fields an operator may change between two calls, without a deploy — applied on the NEXT session. */

import { useState, type FormEvent, type ReactNode } from "react";

import { doing, type Modality, type Provider } from "../../lib/catalogue";
import type { Overridden } from "./door";

// Until this form listed the catalog, the only way to move a stage onto another vendor was to
// know the vendor's name and type it — and the sentence under the field said "anything the runtime
// has no file for is a 422", which was five vendors. It is forty-five now, so each stage has the
// list beside it, every row saying whether this box can actually run it.
//
// The order the form asks in is the order of the three panels above it, so the eye goes straight
// from the vendor it is unhappy with to the field that changes it.
const STAGES = [
  { field: "stt", modality: "stt", label: "stt", note: "which ear hears the caller. Pick a vendor, and name a model beside it when its own default is not wanted." },
  { field: "llm", modality: "llm", label: "llm", note: "what reads the words and answers." },
  { field: "tts", modality: "tts", label: "tts", note: "what says it out loud. The voice below is then that vendor's own id for a voice." },
] as const satisfies readonly { field: keyof Overridden; modality: Modality; label: string; note: string }[];

// The curated names are ElevenLabs' and nobody else's (providers/tts/voices.py). So the voice is a
// LIST while that is the vendor and a text box once it is not: a select of three English premades
// is not a control for somebody who has just moved the stage onto Cartesia.
const CURATED = "elevenlabs";
const VOICE_LIST_NOTE = "one of the voices this build curates, by name. The list is the gateway's; the console keeps none of its own.";
const VOICE_ID_NOTE = "that vendor's own id for a voice. This build does not know its shape and does not judge it — the vendor does, while the agent declares itself.";
const MODEL_NOTE = "the tts model, when the vendor's own default is not wanted. Only ElevenLabs has a list this build judges; every other vendor judges its own.";

// A field left empty is the knob given back to the app, and the placeholder says what the app
// declared for it — the value the next session runs — so an empty field never reads as a blank.
const declaredAs = (value: string): string => (value === "" ? "what the app declared" : `${value} · declared by the app`);

// A knob is one string — `cartesia`, `cartesia/sonic-3`, or a bare model on the vendor in use — and
// the form is two controls over that one string. These two functions are the whole of the split.
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

export function Controls({
  turned,
  declared,
  voices,
  providers,
  saving,
  error,
  onTurn,
}: {
  turned: Overridden;
  declared: Record<keyof Overridden, string>;
  voices: readonly string[];
  providers: readonly Provider[];
  saving: boolean;
  error: string | null;
  onTurn: (knobs: Partial<Overridden>) => Promise<void>;
}): ReactNode {
  const [typed, setTyped] = useState<Partial<Overridden>>({});
  const [saved, setSaved] = useState(false);

  const valueOf = (field: keyof Overridden): string => typed[field] ?? turned[field] ?? "";
  // Which vendor will speak once this form is saved: the tts knob if it is turned, otherwise
  // whatever the gateway said the speaking stage runs on. It decides what the voice field IS.
  const ttsNames = new Set(doing(providers, "tts").map((one) => one.name));
  const speaking = vendorOf(valueOf("tts"), ttsNames) || declared.tts || CURATED;
  const change = (field: keyof Overridden, asked: string): void => {
    setSaved(false);
    setTyped({ ...typed, [field]: asked });
  };

  // The form sends what is on screen, whole: every knob that has a value, and no key at all for
  // one that is empty. That is what gives a knob back to the app — an empty string is refused.
  const save = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    const asked: Partial<Overridden> = {};
    for (const field of Object.keys(turned) as (keyof Overridden)[]) {
      const value = valueOf(field).trim();
      if (value !== "") asked[field] = value;
    }
    await onTurn(asked);
    setTyped({});
    setSaved(true);
  };

  return (
    <form className="ctl" onSubmit={(event) => void save(event)}>
      {STAGES.map((stage) => (
        <label className="ctl-field" key={stage.field}>
          <span className="ctl-label">{stage.label}</span>
          <Stage
            value={valueOf(stage.field)}
            declared={declared[stage.field]}
            offered={doing(providers, stage.modality)}
            onChange={(asked) => change(stage.field, asked)}
          />
          <p className="ctl-note">{stage.note}</p>
        </label>
      ))}

      <label className="ctl-field">
        <span className="ctl-label">voice</span>
        {speaking === CURATED ? (
          <Voices chosen={valueOf("voice")} declared={declared.voice} names={voices} onChoose={(name) => change("voice", name)} />
        ) : (
          <input
            className="ctl-input mono"
            value={valueOf("voice")}
            spellCheck={false}
            placeholder={`${speaking}'s own voice id`}
            onChange={(event) => change("voice", event.target.value)}
          />
        )}
        <p className="ctl-note">{speaking === CURATED ? VOICE_LIST_NOTE : VOICE_ID_NOTE}</p>
      </label>

      <label className="ctl-field">
        <span className="ctl-label">tts_model</span>
        <input
          className="ctl-input mono"
          value={valueOf("tts_model")}
          spellCheck={false}
          placeholder={declaredAs(declared.tts_model)}
          onChange={(event) => change("tts_model", event.target.value)}
        />
        <p className="ctl-note">{MODEL_NOTE}</p>
      </label>

      <label className="ctl-field ctl-field-wide">
        <span className="ctl-label">greeting</span>
        <textarea
          className="ctl-input ctl-textarea"
          value={valueOf("greeting")}
          rows={3}
          placeholder={declared.greeting === "" ? "empty = the class opens the call as it declared, or not at all" : declaredAs(declared.greeting)}
          onChange={(event) => change("greeting", event.target.value)}
        />
        <p className="ctl-note">spoken verbatim as the call opens — said, never generated, so typing here also stops a class that improvises its opening. It applies to the NEXT session.</p>
      </label>

      <div className="ctl-foot">
        <button className="ctl-save" type="submit" disabled={saving}>
          {saving ? "saving…" : "save"}
        </button>
        <span className="ctl-banner">applies to the NEXT session — a call already running keeps the pipeline it started with.</span>
      </div>

      {error !== null && <p className="ctl-error">{error}</p>}
      {saved && error === null && <p className="ctl-ok">stored. The panels above are the gateway's answer, not a local guess.</p>}
    </form>
  );
}

// One stage: the vendor from the list the gateway answered with, and the model beside it. A vendor
// this box cannot run is still on the list, marked — hiding it would leave an operator wondering
// why the vendor they pay for is not there, when the answer is one `pip install` or one key.
function Stage({
  value,
  declared,
  offered,
  onChange,
}: {
  value: string;
  declared: string;
  offered: readonly Provider[];
  onChange: (asked: string) => void;
}): ReactNode {
  const names = new Set(offered.map((one) => one.name));
  const vendor = vendorOf(value, names);
  const model = modelOf(value, names);
  return (
    <div className="ctl-stage">
      <select className="ctl-input mono" value={vendor} onChange={(event) => onChange(asOneString(event.target.value, model))}>
        <option value="">{declaredAs(declared)}</option>
        {offered.map((one) => (
          <option key={one.name} value={one.name}>
            {one.name}
            {one.ready ? "" : ` — ${one.standing}`}
          </option>
        ))}
      </select>
      <input
        className="ctl-input mono"
        value={model}
        spellCheck={false}
        placeholder="the vendor's own default model"
        onChange={(event) => onChange(asOneString(vendor, event.target.value))}
      />
    </div>
  );
}

// A list and not a text box: an id pasted out of a vendor dashboard reads as a voice on screen and
// closes the line on the call. A voice already turned that this build does not curate stays on the
// list as its own option, so opening the form never silently changes what the agent speaks with.
function Voices({
  chosen,
  declared,
  names,
  onChoose,
}: {
  chosen: string;
  declared: string;
  names: readonly string[];
  onChoose: (name: string) => void;
}): ReactNode {
  const offered = names.includes(chosen) || chosen === "" ? names : [chosen, ...names];
  return (
    <select className="ctl-input mono" value={chosen} onChange={(event) => onChoose(event.target.value)}>
      <option value="">{declaredAs(declared)}</option>
      {offered.map((name) => (
        <option key={name} value={name}>
          {name}
        </option>
      ))}
    </select>
  );
}
