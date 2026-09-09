/** The supervisor's moves on one call: listen in, whisper or speak, take the line, transfer, end. */

import { useState, type ReactNode } from "react";

import { useListen } from "../../lib/use-listen";
import { useSupervise, type Supervising } from "../../lib/use-supervise";
import "./supervise.css";

// One box, two things to do with a sentence: tell the agent something the caller never hears, or
// put it in the agent's mouth verbatim. The toggle says which, so there is no second input to read.
type Mode = "whisper" | "say";
const ASKS: Record<Mode, string> = {
  whisper: "whisper to the agent",
  say: "say it to the caller, verbatim",
};

// Nothing here draws the state of the call: what a move did is in the log, in the timeline beside
// this panel, as its own supervisor.* line. The only thing the panel knows is who holds the line.
export function Supervise({ call, live }: { call: string; live: boolean }): ReactNode {
  const ear = useListen(call);
  const desk = useSupervise(call);
  const refused = ear.error ?? desk.error;
  return (
    <div className="supervise">
      <Listen ear={ear} live={live} />
      {live && <Desk desk={desk} />}
      {refused !== null && <span className="supervise-refused fixed">{refused}</span>}
    </div>
  );
}

// Three states, three labels: not in the room yet, in it and reading, in it and hearing.
function Listen({ ear, live }: { ear: ReturnType<typeof useListen>; live: boolean }): ReactNode {
  if (!live) {
    return (
      <button className="supervise-move" type="button" disabled title="the call is over: read its log, or play its recording">
        listen
      </button>
    );
  }
  switch (ear.listening) {
    case "off":
    case "failed":
      return (
        <button className="supervise-move supervise-can" type="button" onClick={() => void ear.join()}>
          listen
        </button>
      );
    case "joining":
      return (
        <button className="supervise-move" type="button" disabled>
          joining…
        </button>
      );
    case "muted":
      return (
        <>
          <button className="supervise-move supervise-can" type="button" onClick={() => ear.hear(true)}>
            hear it
          </button>
          <button className="supervise-move supervise-can" type="button" onClick={() => void ear.leave()}>
            stop
          </button>
        </>
      );
    case "on":
      return (
        <>
          <button className="supervise-move supervise-live" type="button" onClick={() => ear.hear(false)}>
            listening · mute
          </button>
          <button className="supervise-move supervise-can" type="button" onClick={() => void ear.leave()}>
            stop
          </button>
        </>
      );
  }
}

// The five verbs that change a call. Two of them are irreversible, so neither goes out on a stray
// click: a transfer needs the number typed and entered, and an end needs the button pressed twice.
function Desk({ desk }: { desk: Supervising }): ReactNode {
  const [mode, setMode] = useState<Mode>("whisper");
  const [text, setText] = useState("");
  const [to, setTo] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);

  const send = (): void => {
    if (text.trim() === "") {
      return;
    }
    void (mode === "whisper" ? desk.whisper(text) : desk.say(text));
    setText("");
  };

  const sendTransfer = (): void => {
    if (to === null || to.trim() === "") {
      return;
    }
    void desk.transfer(to.trim());
    setTo(null);
  };

  return (
    <>
      <button
        className="supervise-move supervise-can"
        type="button"
        onClick={() => setMode(mode === "whisper" ? "say" : "whisper")}
        title="the same box, told to the agent or spoken to the caller"
      >
        {mode}
      </button>
      <input
        className="supervise-text"
        onChange={(typed) => setText(typed.target.value)}
        onKeyDown={(key) => {
          if (key.key === "Enter") send();
        }}
        placeholder={ASKS[mode]}
        value={text}
      />
      <button
        className={desk.holding ? "supervise-move supervise-live" : "supervise-move supervise-can"}
        type="button"
        onClick={() => void (desk.holding ? desk.release() : desk.takeOver())}
      >
        {desk.holding ? "hand back" : "take over"}
      </button>
      {to === null ? (
        <button className="supervise-move supervise-can" type="button" onClick={() => setTo("")}>
          transfer
        </button>
      ) : (
        <input
          className="supervise-to fixed"
          onChange={(typed) => setTo(typed.target.value)}
          onKeyDown={(key) => {
            if (key.key === "Enter") sendTransfer();
            if (key.key === "Escape") setTo(null);
          }}
          placeholder="+59899000000"
          value={to}
        />
      )}
      <button
        className={ending ? "supervise-move supervise-danger" : "supervise-move supervise-can"}
        type="button"
        onClick={() => {
          if (ending) void desk.end();
          setEnding(!ending);
        }}
      >
        {ending ? "end · sure?" : "end"}
      </button>
    </>
  );
}
