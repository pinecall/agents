/** How a call opens and ends, and how a turn is cut: the Conversation section. */

import type { ReactNode } from "react";

import { Input, Label, Segmented, Select, TextArea } from "../../ui";
import type { Typed } from "./typed";

const OPENINGS = [
  { value: "say", label: "Say these words" },
  { value: "reply", label: "Let the model open" },
] as const;

// The two numbers of a turn, as lists of values that run: the ears take 500 to 3000 ms of silence
// (soniox/stt.py:145), and the runtime's defaults are 1000 ms and two words.
const SILENCES = ["500", "700", "1000", "1500", "2000", "3000"];
const WORDS = ["1", "2", "3", "4", "5"];

export function ConversationSection({
  typed,
  wordsOnly,
  change,
}: {
  typed: Typed;
  /** A key that opens words and not the pipeline: the words of the opening, and nothing else here. */
  wordsOnly: boolean;
  change: (field: keyof Typed, value: string) => void;
}): ReactNode {
  return (
    <section className="set-section">
      <div className="set-section-head">
        <h2 className="set-section-title">Conversation</h2>
        <p className="set-section-blurb">The first thing a caller hears, when the agent may hang up, and how quickly a turn is cut.</p>
      </div>
      <div className="set-field set-wide">
        <Label>Opening</Label>
        {!wordsOnly && <Segmented options={OPENINGS} value={typed.opening} onChange={(picked) => change("opening", picked)} />}
        {typed.opening === "say" || wordsOnly ? (
          <TextArea value={typed.say} rows={2} placeholder="The exact words the caller hears first" onChange={(event) => change("say", event.target.value)} />
        ) : (
          <TextArea value={typed.reply} rows={2} placeholder="What the model is told about how to open the call" onChange={(event) => change("reply", event.target.value)} />
        )}
        <p className="set-help">
          {typed.opening === "say" || wordsOnly
            ? "Said exactly as written, before the model runs: the caller hears it at once."
            : "An instruction the model reads to find its own opening. It costs a model round trip before the caller hears anything."}
        </p>
      </div>
      {!wordsOnly && (
        <>
          <div className="set-field set-wide">
            <Label>May hang up when</Label>
            <Input value={typed.hangup} placeholder="the person has what they came for, or asks you to end the call" onChange={(event) => change("hangup", event.target.value)} />
            <p className="set-help">In your words. Empty: the agent never ends the call itself.</p>
          </div>
          <div className="set-row">
            <div className="set-field">
              <Label>Silence that ends a turn</Label>
              <Select value={typed.endpointing_ms} onChange={(event) => change("endpointing_ms", event.target.value)}>
                <option value="">Runtime default · 1 second</option>
                {listed(SILENCES, typed.endpointing_ms).map((ms) => (
                  <option key={ms} value={ms}>
                    {Number(ms) / 1000} s
                  </option>
                ))}
              </Select>
              <p className="set-help">How long the caller stays quiet before the agent answers. Shorter answers faster, and cuts off a slow speaker.</p>
            </div>
            <div className="set-field">
              <Label>Words before an interruption counts</Label>
              <Select value={typed.min_interruption_words} onChange={(event) => change("min_interruption_words", event.target.value)}>
                <option value="">Runtime default · 2 words</option>
                {listed(WORDS, typed.min_interruption_words).map((words) => (
                  <option key={words} value={words}>
                    {words === "1" ? "1 word" : `${words} words`}
                  </option>
                ))}
              </Select>
              <p className="set-help">How many words a caller says over the agent before it stops talking. A cough is not an interruption.</p>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

// A value set from the terminal that is not on the list stays on it, so the form never drops it.
function listed(values: readonly string[], set: string): readonly string[] {
  return set === "" || values.includes(set) ? values : [set, ...values];
}
