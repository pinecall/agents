/** The three stages of a turn as sections: the vendor and the model picked from lists, and the voice. */

import type { ReactNode } from "react";

import { doing, type Provider } from "../../lib/catalogue";
import { Label, Select } from "../../ui";
import type { Knob, Modality } from "./typed";

/** The vendor this build curates voices for by name; every other vendor takes its own voice id. */
export const CURATED = "elevenlabs";

const NOT_HERE = "not on this box";

export function StageSection({
  modality,
  title,
  blurb,
  knob,
  providers,
  defaults,
  models,
  onChange,
  children,
}: {
  modality: Modality;
  title: string;
  blurb: string;
  knob: Knob;
  providers: readonly Provider[];
  defaults: Readonly<Record<string, string>>;
  models: Readonly<Record<string, readonly string[]>>;
  onChange: (knob: Knob) => void;
  children?: ReactNode;
}): ReactNode {
  // Only what this box can run: a vendor with a key here AND models this build runs at it. A vendor
  // with no key is a line that would go out silent, and one with no models is a name to guess at.
  // A vendor set from the terminal that is neither still shows, said so, rather than a list that
  // quietly reads as "nothing chosen".
  const ready = doing(providers, modality).filter((one) => one.ready && (models[`${modality}/${one.name}`] ?? []).length > 0);
  const runtimeDefault = defaults[modality] ?? "";
  const vendor = knob.vendor === "" ? runtimeDefault : knob.vendor;
  const listed = ready.some((one) => one.name === knob.vendor) ? ready : knob.vendor === "" ? ready : [{ name: knob.vendor, ready: false } as Provider, ...ready];
  const known = models[`${modality}/${vendor}`] ?? [];
  const options = known.includes(knob.model) || knob.model === "" ? known : [knob.model, ...known];
  return (
    <section className="set-section">
      <div className="set-section-head">
        <h2 className="set-section-title">{title}</h2>
        <p className="set-section-blurb">{blurb}</p>
      </div>
      <div className="set-row">
        <div className="set-field">
          <Label>Vendor</Label>
          <Select value={knob.vendor} onChange={(event) => onChange({ vendor: event.target.value, model: "" })}>
            <option value="">Runtime default · {runtimeDefault}</option>
            {listed.map((one) => (
              <option key={one.name} value={one.name}>
                {one.name}
                {one.ready ? "" : ` · ${NOT_HERE}`}
              </option>
            ))}
          </Select>
          <p className="set-help">The vendors this box has a key for. Another one appears here once its key is added in Providers.</p>
        </div>
        <div className="set-field">
          <Label>Model</Label>
          <Select value={knob.model} onChange={(event) => onChange({ ...knob, model: event.target.value })}>
            <option value="">{vendor}'s default{known[0] === undefined ? "" : ` · ${known[0]}`}</option>
            {options.map((name) => (
              <option key={name} value={name}>
                {name}
                {known.includes(name) ? "" : " · as set"}
              </option>
            ))}
          </Select>
          <p className="set-help">{known.length === 0 ? `${vendor} runs its own default; there is no model to pick.` : "The models that run on this box. The default is the one tuned for phone calls."}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

/** The voice: one of the curated names on the vendor this build curates; any other vendor speaks in its model's own. */
export function VoiceField({ vendor, voice, voices, onChange }: { vendor: string; voice: string; voices: readonly string[]; onChange: (voice: string) => void }): ReactNode {
  if (vendor !== CURATED) {
    return (
      <div className="set-row">
        <div className="set-field">
          <Label>Voice</Label>
          <p className="set-help">
            {voice === "" ? `${vendor} speaks in its model's own voice: there is no voice to pick here.` : `${vendor} speaks as ${voice}, set from the terminal.`} The voices to pick from are {CURATED}'s.
          </p>
        </div>
      </div>
    );
  }
  const options = voices.includes(voice) || voice === "" ? voices : [voice, ...voices];
  return (
    <div className="set-row">
      <div className="set-field">
        <Label>Voice</Label>
        <Select value={voice} onChange={(event) => onChange(event.target.value)}>
          <option value="">Runtime default</option>
          {options.map((name) => (
            <option key={name} value={name}>
              {name}
              {voices.includes(name) ? "" : " · as set"}
            </option>
          ))}
        </Select>
        <p className="set-help">Hear each one in the Talk tab before a caller does.</p>
      </div>
    </div>
  );
}
