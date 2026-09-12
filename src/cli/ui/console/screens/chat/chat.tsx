/** Chat: the class of this directory talked to in writing, in the browser, on the call's own log. */

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router";

import { GatewayError } from "../../lib/api";
import { useCredentials } from "../../lib/credentials";
import { Nothing } from "../../shell/nothing";
import { Live } from "../live";
import { endChat, readChatRoster, sayInChat, startChat, type Roster } from "./door";
import "./chat.css";

/**
 * The screen. It asks the console's own server, never the gateway: a written call is served by the
 * class mounted in the process that typed `pinecall ui`, exactly as `pinecall chat` serves one —
 * so a breakpoint in a @tool is reachable in that terminal. The call in the path is the call being
 * talked to, so a reload lands back in the same conversation.
 */
export function Chat(): ReactNode {
  const credentials = useCredentials();
  const navigate = useNavigate();
  const params = useParams();
  const agent = params["agent"] ?? "";
  const call = params["call"];
  const [roster, setRoster] = useState<Roster | null>(null);
  const [as, setAs] = useState("");
  const [golden, setGolden] = useState("");
  const [refused, setRefused] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    let gone = false;
    readChatRoster(credentials, agent).then(
      (read) => {
        if (!gone) setRoster(read);
      },
      (failed: unknown) => {
        if (!gone) setRefused(failed instanceof Error ? failed.message : String(failed));
      },
    );
    return () => {
      gone = true;
    };
  }, [credentials]);

  if (roster === null) return refused === null ? null : <p className="note note-warn">{refused}</p>;
  if (roster.agent !== agent) {
    return (
      <Nothing>
        {roster.agent === null
          ? "No agent class in the directory the agent's `pinecall run` runs in, so there is nothing to chat with. Run `pinecall run` where the agent's agent.tsx is."
          : `The process holding the agent runs in ${roster.agent}'s directory: to chat with ${agent}, run \`pinecall run\` there.`}
      </Nothing>
    );
  }

  const open = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setOpening(true);
    setRefused(null);
    try {
      navigate(`/a/${agent}/chat/${await startChat(credentials, agent, as.trim(), golden)}`);
    } catch (failed) {
      setRefused(failed instanceof GatewayError ? failed.message : String(failed));
    } finally {
      setOpening(false);
    }
  };

  if (call === undefined) {
    return (
      <section className="chat">
        <form className="chat-open" onSubmit={(event) => void open(event)}>
          <h2 className="call-group-name">Chat</h2>
          <p className="chat-what">
            The class of this directory, in writing. The tools run in the terminal that serves this
            page, on the same log every other screen reads — and a conversation can open part-way
            through, in the state one of this directory's goldens declares.
          </p>
          <label className="chat-field">
            <span className="chat-label">as</span>
            <input
              className="input chat-input mono"
              value={as}
              placeholder="a phone number, a customer id — or nobody"
              onChange={(event) => setAs(event.target.value)}
            />
          </label>
          {roster.states.length > 0 && (
            <label className="chat-field">
              <span className="chat-label">from</span>
              <select className="input chat-input mono" value={golden} onChange={(event) => setGolden(event.target.value)}>
                <option value="">the call's own opening</option>
                {roster.states.map((name) => (
                  <option key={name} value={name}>
                    the state of {name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button type="submit" className="button" disabled={opening}>
            {opening ? "opening…" : "start a chat"}
          </button>
          {refused !== null && <p className="note note-warn">{refused}</p>}
        </form>
      </section>
    );
  }

  return (
    <section className="chat">
      <Live call={call} />
      <Composer agent={agent} call={call} />
    </section>
  );
}

/** The caller's side: one line at a time down the socket the terminal holds, and the hangup. */
function Composer({ agent, call }: { agent: string; call: string }): ReactNode {
  const credentials = useCredentials();
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);

  const say = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    const said = text.trim();
    if (said === "") return;
    setSending(true);
    setRefused(null);
    try {
      await sayInChat(credentials, agent, call, said);
      setText("");
    } catch (failed) {
      setRefused(failed instanceof GatewayError ? failed.message : String(failed));
    } finally {
      setSending(false);
    }
  };

  // Hanging up is what seals the log and runs the judges at ring 4, so it is a button and not a
  // navigation: leaving the page would keep the socket open in the terminal behind it.
  const hangUp = async (): Promise<void> => {
    try {
      await endChat(credentials, agent, call);
    } catch (failed) {
      setRefused(failed instanceof GatewayError ? failed.message : String(failed));
      return;
    }
    navigate(`/a/${agent}/sessions/${call}`);
  };

  return (
    <form className="chat-composer" onSubmit={(event) => void say(event)}>
      <input
        className="input chat-say"
        value={text}
        autoFocus
        placeholder="say something"
        onChange={(event) => setText(event.target.value)}
      />
      <button type="submit" className="button" disabled={sending || text.trim() === ""}>
        say
      </button>
      <button type="button" className="button" onClick={() => void hangUp()}>
        hang up
      </button>
      {refused !== null && <p className="note note-warn">{refused}</p>}
    </form>
  );
}
