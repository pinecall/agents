/** The desk under the head of a watched call: listen in, whisper or say, take the line, transfer, end. */

import { useState, type ReactNode } from "react";

import { useListen } from "../../lib/use-listen";
import { useSupervise, type Supervising } from "../../lib/use-supervise";
import "./supervise.css";

// One box, two things to do with a sentence: tell the agent something the caller never hears, or
// put it in the agent's mouth verbatim. The segment says which, so there is no second input to read.
type Mode = "whisper" | "say";
const ASKS: Record<Mode, string> = {
  whisper: "the agent is told this — the caller never hears it",
  say: "the agent says this to the caller, verbatim",
};

// Nothing here draws the state of the call: what a move did is in the log, in the timeline under
// this strip, as its own supervisor.* line. The only thing the desk knows is who holds the line.
export function Supervise({ call, live }: { call: string; live: boolean }): ReactNode {
  const ear = useListen(call);
  const desk = useSupervise(call);
  const refused = ear.error ?? desk.error;
  return (
    <>
      <div className="live-desk">
        <Listen ear={ear} live={live} />
        {live && <Desk desk={desk} />}
      </div>
      {refused !== null && <p className="live-refused fixed">{refused}</p>}
    </>
  );
}

// Four states, one button with a dot: off, joining, in the room reading, in the room hearing.
function Listen({ ear, live }: { ear: ReturnType<typeof useListen>; live: boolean }): ReactNode {
  if (!live) {
    return (
      <Move disabled dot="off" title="the call is over: read its log, or play its recording">
        listen
      </Move>
    );
  }
  switch (ear.listening) {
    case "off":
    case "failed":
      return (
        <Move dot="off" onClick={() => void ear.join()}>
          listen
        </Move>
      );
    case "joining":
      return (
        <Move disabled dot="warm">
          joining…
        </Move>
      );
    case "muted":
      return (
        <>
          <Move dot="warm" onClick={() => ear.hear(true)}>
            hear it
          </Move>
          <Move dot="warm" onClick={() => void ear.leave()}>
            stop
          </Move>
        </>
      );
    case "on":
      return (
        <>
          <Move dot="on" onClick={() => ear.hear(false)}>
            listening · mute
          </Move>
          <Move dot="warm" onClick={() => void ear.leave()}>
            stop
          </Move>
        </>
      );
  }
}

/** One move of the desk: a bordered button, with a dot when it stands for the ear. */
function Move({
  dot,
  armed = false,
  disabled = false,
  title,
  onClick,
  children,
}: {
  dot?: "off" | "warm" | "on";
  armed?: boolean;
  disabled?: boolean;
  title?: string;
  onClick?: () => void;
  children: ReactNode;
}): ReactNode {
  const tone = dot === "on" ? "desk-move desk-move-on" : dot === "warm" || armed ? "desk-move desk-move-armed" : "desk-move";
  return (
    <button type="button" className={tone} disabled={disabled} title={title} onClick={onClick}>
      {dot !== undefined && <span className={`desk-dot desk-dot-${dot}`} aria-hidden />}
      {children}
    </button>
  );
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
      <div className="desk-box" role="group" aria-label="whisper or say">
        {(["whisper", "say"] as const).map((one) => (
          <button
            key={one}
            type="button"
            className={one === mode ? "desk-mode desk-mode-here fixed" : "desk-mode fixed"}
            onClick={() => setMode(one)}
            aria-pressed={one === mode}
          >
            {one}
          </button>
        ))}
        <input
          className="desk-text"
          onChange={(typed) => setText(typed.target.value)}
          onKeyDown={(key) => {
            if (key.key === "Enter") send();
          }}
          placeholder={ASKS[mode]}
          value={text}
        />
      </div>
      <Move armed={desk.holding} onClick={() => void (desk.holding ? desk.release() : desk.takeOver())}>
        {desk.holding ? "hand back" : "take over"}
      </Move>
      {to === null ? (
        <Move onClick={() => setTo("")}>transfer</Move>
      ) : (
        <span className="desk-to fixed">
          <input
            className="desk-to-number"
            autoFocus
            onChange={(typed) => setTo(typed.target.value)}
            onKeyDown={(key) => {
              if (key.key === "Enter") sendTransfer();
              if (key.key === "Escape") setTo(null);
            }}
            placeholder="+34"
            value={to}
          />
        </span>
      )}
      <Move
        armed={ending}
        onClick={() => {
          if (ending) void desk.end();
          setEnding(!ending);
        }}
      >
        {ending ? "end · sure?" : "end"}
      </Move>
    </>
  );
}
