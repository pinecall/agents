/** The fields an operator may change between two calls, without a deploy — applied on the NEXT session. */

import { useState, type FormEvent, type ReactNode } from "react";

import type { Overridden } from "./door";

// The order the form asks in is the order of the three panels above it, so the eye goes straight
// from the vendor it is unhappy with to the field that changes it.
const KNOBS = [
  { field: "stt", label: "stt", note: "which ear hears the caller — vendor/model, or a model alone to keep the vendor. Anything the runtime has no file for is a 422 from the gateway, in its own words." },
  { field: "llm", label: "llm", note: "what reads the words and answers — vendor/model, or a model alone to keep the vendor." },
  { field: "voice", label: "voice", note: "one of the voices this build curates, by name. The list is the gateway's; the console keeps none of its own." },
  { field: "tts_model", label: "tts_model", note: "only a model this build runs is accepted — refused by the gateway, not hidden by this form." },
] as const satisfies readonly { field: keyof Overridden; label: string; note: string }[];

// A field left empty is the knob given back to the app, and the placeholder says what the app
// declared for it — the value the next session runs — so an empty field never reads as a blank.
const declaredAs = (value: string): string => (value === "" ? "what the app declared" : `${value} · declared by the app`);

export function Controls({
  turned,
  declared,
  voices,
  saving,
  error,
  onTurn,
}: {
  turned: Overridden;
  declared: Record<keyof Overridden, string>;
  voices: readonly string[];
  saving: boolean;
  error: string | null;
  onTurn: (knobs: Partial<Overridden>) => Promise<void>;
}): ReactNode {
  const [typed, setTyped] = useState<Partial<Overridden>>({});
  const [saved, setSaved] = useState(false);

  const valueOf = (field: keyof Overridden): string => typed[field] ?? turned[field] ?? "";
  const change = (field: keyof Overridden, asked: string): void => {
    setSaved(false);
    setTyped({ ...typed, [field]: asked });
  };

  // The form sends what is on screen, whole: every knob that has a value, and no key at all for
  // one that is empty. That is what gives a knob back to the app — an empty string is refused.
  const save = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    const asked: Partial<Overridden> = {};
    for (const field of [...KNOBS.map((knob) => knob.field), "greeting"] as (keyof Overridden)[]) {
      const value = valueOf(field).trim();
      if (value !== "") asked[field] = value;
    }
    await onTurn(asked);
    setTyped({});
    setSaved(true);
  };

  return (
    <form className="ctl" onSubmit={(event) => void save(event)}>
      {KNOBS.map((knob) => (
        <label className="ctl-field" key={knob.field}>
          <span className="ctl-label">{knob.label}</span>
          {knob.field === "voice" ? (
            <Voices chosen={valueOf("voice")} declared={declared.voice} names={voices} onChoose={(name) => change("voice", name)} />
          ) : (
            <input
              className="ctl-input mono"
              value={valueOf(knob.field)}
              spellCheck={false}
              placeholder={declaredAs(declared[knob.field])}
              onChange={(event) => change(knob.field, event.target.value)}
            />
          )}
          <p className="ctl-note">{knob.note}</p>
        </label>
      ))}

      <label className="ctl-field ctl-field-wide">
        <span className="ctl-label">greeting</span>
        <textarea
          className="ctl-input ctl-textarea"
          value={valueOf("greeting")}
          rows={3}
          placeholder={declared.greeting === "" ? "empty = the class opens the call as it always has" : declaredAs(declared.greeting)}
          onChange={(event) => change("greeting", event.target.value)}
        />
        <p className="ctl-note">spoken verbatim as the call opens — said, never generated. It applies to the NEXT session.</p>
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
