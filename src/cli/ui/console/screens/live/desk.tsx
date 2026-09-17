/** The supervisor's desk under a watched call: listen in, whisper or say, take the line, transfer, end. */

import { useEffect, useRef, useState, type ReactNode } from "react";

import { useListen, type Ear } from "../../lib/use-listen";
import { useSupervise, type Supervising } from "../../lib/use-supervise";
import { Button, Input, Segmented } from "../../ui";

// One box, two things to do with a sentence: tell the agent something the caller never hears, or
// put it in the agent's mouth verbatim. The segment says which, so there is no second input to read.
type Mode = "whisper" | "say";
const ASKS: Record<Mode, string> = {
  whisper: "Whisper to the agent — the caller never hears it",
  say: "Say it to the caller, in the agent's voice, verbatim",
};

/**
 * Mounting the desk takes a seat in the room, muted, so a person opens it to read the call and then
 * chooses to hear it; unmounting leaves the room (both hooks do). Nothing here draws what a move did:
 * that is in the log below, as its own supervisor row. The only thing the desk knows is who holds the line.
 */
export function Desk({ call, live }: { call: string; live: boolean }): ReactNode {
  const ear = useListen(call);
  const desk = useSupervise(call);
  const joined = useRef(false);

  useEffect(() => {
    if (!live || joined.current) return;
    joined.current = true;
    void ear.join();
  }, [live, ear]);

  const refused = ear.error ?? desk.error;
  return (
    <div className="lv-desk" role="group" aria-label="the supervisor's desk">
      <Listen ear={ear} live={live} />
      {live ? (
        <Moves desk={desk} />
      ) : (
        <span className="lv-desk-note">The call is over: nothing is left to supervise. Read its log below, or play its recording.</span>
      )}
      {refused !== null && <span className="lv-desk-refused">{refused}</span>}
    </div>
  );
}

// Four states, one button with a dot: off, joining, in the room reading, in the room hearing.
function Listen({ ear, live }: { ear: Ear; live: boolean }): ReactNode {
  if (!live) return null;
  switch (ear.listening) {
    case "off":
    case "failed":
      return (
        <Button size="sm" pill onClick={() => void ear.join()}>
          <span className="lv-desk-dot" />
          Listen
        </Button>
      );
    case "joining":
      return (
        <Button size="sm" pill disabled>
          <span className="lv-desk-dot lv-desk-dot-warm" />
          Joining…
        </Button>
      );
    case "muted":
      return (
        <>
          <Button size="sm" pill onClick={() => ear.hear(true)}>
            <span className="lv-desk-dot lv-desk-dot-warm" />
            Hear it
          </Button>
          <Button size="sm" pill onClick={() => void ear.leave()}>
            Stop
          </Button>
        </>
      );
    case "on":
      return (
        <>
          <Button size="sm" pill onClick={() => ear.hear(false)}>
            <span className="lv-desk-dot lv-desk-dot-on" />
            Listening · mute
          </Button>
          <Button size="sm" pill onClick={() => void ear.leave()}>
            Stop
          </Button>
        </>
      );
  }
}

// The five verbs that change a call. Two of them are irreversible, so neither goes out on a stray
// click: a transfer needs the number typed and entered, and an end needs the button pressed twice.
function Moves({ desk }: { desk: Supervising }): ReactNode {
  const [mode, setMode] = useState<Mode>("whisper");
  const [text, setText] = useState("");
  const [to, setTo] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);

  const send = (): void => {
    if (text.trim() === "") return;
    void (mode === "whisper" ? desk.whisper(text) : desk.say(text));
    setText("");
  };

  const sendTransfer = (): void => {
    if (to === null || to.trim() === "") return;
    void desk.transfer(to.trim());
    setTo(null);
  };

  return (
    <>
      <div className="lv-desk-say">
        <Segmented
          options={[
            { value: "whisper", label: "Whisper" },
            { value: "say", label: "Say" },
          ]}
          value={mode}
          onChange={setMode}
        />
        <Input
          size="sm"
          className="lv-desk-text"
          value={text}
          placeholder={ASKS[mode]}
          onChange={(typed) => setText(typed.target.value)}
          onKeyDown={(key) => {
            if (key.key === "Enter") send();
          }}
        />
        <Button size="sm" kind="primary" disabled={text.trim() === ""} onClick={send}>
          Send
        </Button>
      </div>
      <Button
        size="sm"
        className={desk.holding ? "lv-desk-holding" : undefined}
        title={desk.holding ? "the agent hears and speaks again, and your microphone stops" : "your microphone takes the line: the agent stops speaking"}
        onClick={() => void (desk.holding ? desk.release() : desk.takeOver())}
      >
        {desk.holding ? "Hand back" : "Take the line"}
      </Button>
      {to === null ? (
        <Button size="sm" onClick={() => setTo("")}>
          Transfer
        </Button>
      ) : (
        <>
          <Input
            size="sm"
            className="lv-desk-number"
            autoFocus
            value={to}
            placeholder="+34… then Enter"
            onChange={(typed) => setTo(typed.target.value)}
            onKeyDown={(key) => {
              if (key.key === "Enter") sendTransfer();
              if (key.key === "Escape") setTo(null);
            }}
          />
          <Button size="sm" disabled={to.trim() === ""} onClick={sendTransfer}>
            Transfer
          </Button>
          <Button size="sm" onClick={() => setTo(null)}>
            Cancel
          </Button>
        </>
      )}
      <Button
        size="sm"
        kind="danger"
        className={ending ? "lv-desk-armed" : undefined}
        onClick={() => {
          if (ending) void desk.end();
          setEnding(!ending);
        }}
        onBlur={() => setEnding(false)}
      >
        {ending ? "End · sure?" : "End call"}
      </Button>
    </>
  );
}
