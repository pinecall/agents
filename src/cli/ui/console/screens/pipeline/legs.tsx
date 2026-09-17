/** The three providers of a voice turn, each as a card: what hears, what decides, what speaks. */

import type { ReactNode } from "react";

import { Pill } from "../../ui";
import type { Stage } from "./door";

// Every value comes from the gateway's report, which reads the runtime's own provider files with
// the agent's overrides already applied. The sentence under a value explains what it decides; the
// value is the server's.

interface LegProps {
  stage: Stage;
  unavailable: string | null;
  /** An operator has moved this stage from what the class declared. */
  turned: boolean;
}

export function HearsLeg({ stage, unavailable, turned }: LegProps): ReactNode {
  return (
    <Leg job="hears" stage={stage} unavailable={unavailable} turned={turned}>
      <Field label="Language" value={stage.language ?? "the vendor's default"} note="What the ear is told to expect; the runtime adds the names the state carries." />
      {stage.model !== null && stage.model !== "" && <Field label="Model" value={stage.model} />}
      <Field label="Switchable to" value="Any STT provider on file" note="Effective on the next session." />
    </Leg>
  );
}

export function DecidesLeg({ stage, unavailable, turned }: LegProps): ReactNode {
  return (
    <Leg job="decides" stage={stage} unavailable={unavailable} turned={turned}>
      <Field label="Model" value={stage.model ?? "the vendor's default"} />
      <Field
        label="Prompt"
        value="identity · knowledge · tools · history · view"
        note="Named blocks in two regions, never reordered: the static ones are cached, the dynamic ones rewritten every turn."
      />
      <Field label="Tools" value="The class's @tool methods" />
    </Leg>
  );
}

export function SpeaksLeg({ stage, unavailable, turned }: LegProps): ReactNode {
  return (
    <Leg job="speaks" stage={stage} unavailable={unavailable} turned={turned}>
      <Field label="Voice" value={stage.voice_id ?? "the vendor's default"} note="One of the voices this build curates, by name; the id is the vendor's." />
      {stage.model !== null && stage.model !== "" && <Field label="Model" value={stage.model} />}
      <Field label="Aligned transcript" value="On" note="Timed words, so the log knows when each word was spoken." />
    </Leg>
  );
}

function Leg({ job, stage, unavailable, turned, children }: LegProps & { job: string; children: ReactNode }): ReactNode {
  return (
    <div className="ui-card">
      <div className="pipe-leg-head">
        <span className="pipe-leg-vendor">{stage.vendor}</span>
        {turned && (
          <Pill tone="violet" small>
            turned
          </Pill>
        )}
        <span className="pipe-leg-job">{job}</span>
      </div>
      <div className="pipe-leg-body">
        {children}
        {unavailable !== null && (
          <div className="pipe-field">
            <div className="pipe-label">Not right now</div>
            <div className="pipe-refused">{unavailable}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, note }: { label: string; value: string; note?: string }): ReactNode {
  return (
    <div className="pipe-field">
      <div className="pipe-label">{label}</div>
      <div className="pipe-value">{value}</div>
      {note !== undefined && <div className="pipe-note">{note}</div>}
    </div>
  );
}
