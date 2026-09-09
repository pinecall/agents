/** The three providers of a voice turn, each as a panel: what hears, what decides, what speaks. */

import type { ReactNode } from "react";

import type { Stage } from "./door";

// Every value comes from the gateway's report, which reads the runtime's own provider files with
// the agent's overrides already applied. The prose beside a row explains what the row decides; the
// value is the server's.

export function HearsLeg({ stage, unavailable }: { stage: Stage; unavailable: string | null }): ReactNode {
  return (
    <Leg role="hears" vendor={stage.vendor} model={stage.model} unavailable={unavailable}>
      <Row k="language" v={stage.language} note="what the ear is told to expect; the runtime adds the names the state carries" />
      <Row k="switchable to" v="any stt provider file" note="the ear is the agent's declaration, changed from Control below and effective on the NEXT session" />
    </Leg>
  );
}

export function DecidesLeg({ stage, unavailable }: { stage: Stage; unavailable: string | null }): ReactNode {
  return (
    <Leg role="decides" vendor={stage.vendor} model={stage.model} unavailable={unavailable}>
      <Row k="prompt" v="static · history · view" note="three regions, in that order, so the static prefix is cached and never reordered" />
      <Row k="tools" v="the class's @tool methods" note="visible by stage; the only thing that changes the state" />
    </Leg>
  );
}

export function SpeaksLeg({ stage, unavailable }: { stage: Stage; unavailable: string | null }): ReactNode {
  return (
    <Leg role="speaks" vendor={stage.vendor} model={stage.model} unavailable={unavailable}>
      <Row k="voice" v={stage.voice_id} note="one of the voices this build curates, by name; the id is the vendor's" />
      <Row k="aligned transcript" v="on" note="timed words, so the log and the karaoke know when each word was spoken" />
    </Leg>
  );
}

function Leg({
  role,
  vendor,
  model,
  unavailable,
  children,
}: {
  role: string;
  vendor: string;
  model: string | null;
  unavailable: string | null;
  children: ReactNode;
}): ReactNode {
  return (
    <article className="panel leg">
      <div className="panel-head">
        <span className="panel-title">{vendor}</span>
        <span className="badge">{role}</span>
      </div>
      <div className="panel-body">
        <div className="leg-model mono">{model ?? "the provider's default"}</div>
        <dl className="leg-rows">{children}</dl>
        {unavailable !== null && (
          <div className="leg-refused">
            <span className="leg-refused-title">not right now</span>
            <p className="leg-refused-row">{unavailable}</p>
          </div>
        )}
      </div>
    </article>
  );
}

// A field the agent left undeclared has no row: the vendor file's own default answers for it, and
// a blank line beside a name reads as a value that is empty.
function Row({ k, v, note }: { k: string; v: string | null; note?: string }): ReactNode {
  if (v === null) {
    return null;
  }
  return (
    <div className="leg-row">
      <dt className="leg-k">{k}</dt>
      <dd className="leg-v mono">{v}</dd>
      {note && <p className="leg-note">{note}</p>}
    </div>
  );
}
