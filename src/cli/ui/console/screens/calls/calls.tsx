/** Calls: this agent's conversations as an inbox — one thread per person, what was said, and a way to answer. */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router";

import { GatewayError } from "../../../shared/api";
import { useCredentials } from "../../../shared/credentials";
import { clockOf, dayOf, today, utcDay } from "../../lib/format";
import { useAgentSessions } from "../../lib/use-agent-sessions";
import { Avatar } from "../../ui";
import { markRead, readDoorThreads, sayInto, writeTo, type DoorThread } from "./inbox-door";
import { SimulateForm } from "./simulate-form";
import { lastOf, lettersOf, threadsOf, titleOf, type Message, type Thread } from "./threads";
import { useThread } from "./use-thread";
import "./calls.css";

/**
 * The screen. The threads are the agent's sessions grouped by who was on them; the URL names a call,
 * and the thread holding it is the one open. What the gateway keeps per contact on top of that —
 * names, what is unread, a call back, writing into a closed thread — is drawn only when this gateway
 * has the door for it.
 */
export function Calls(): ReactNode {
  const params = useParams();
  const agent = params["agent"] ?? "";
  const chosen = params["call"];
  const navigate = useNavigate();
  const credentials = useCredentials();
  const listed = useAgentSessions(agent);
  const threads = useMemo(() => threadsOf(listed.lines), [listed.lines]);
  const [query, setQuery] = useState("");
  const [simulating, setSimulating] = useState(false);
  const door = useDoorThreads(agent, listed.lines.length);

  const open = threads.find((thread) => chosen !== undefined && thread.lines.some((line) => line.call === chosen)) ?? threads[0];
  const words = query.trim().toLowerCase();
  const shown = threads.filter((thread) => words === "" || `${nameOf(thread, door)} ${thread.handle} ${lastOf(thread)}`.toLowerCase().includes(words));

  useEffect(() => {
    if (open === undefined || door === null || (door.get(open.contact)?.unread ?? 0) === 0) return;
    void markRead(credentials, agent, open.contact).catch(() => undefined);
  }, [open?.contact, door, credentials, agent]);

  return (
    <div className="ib">
      <div className="ib-list">
        <div className="ib-list-head">
          <input className="ib-search" placeholder="Search a caller or number" value={query} onChange={(event) => setQuery(event.target.value)} />
          <button type="button" className="ib-new" title="Simulate a caller" aria-expanded={simulating} onClick={() => setSimulating(!simulating)}>
            +
          </button>
          {simulating && (
            <div className="ib-sim">
              <SimulateForm agent={agent} onClose={() => setSimulating(false)} />
            </div>
          )}
        </div>
        <div className="ib-threads">
          {listed.error !== null && <p className="ib-empty ib-refused">{listed.error}</p>}
          {listed.error === null && threads.length === 0 && (
            <p className="ib-empty">No conversations yet. The first call to reach {agent} opens a thread here as it rings.</p>
          )}
          {threads.length > 0 && shown.length === 0 && <p className="ib-empty">Nobody here matches “{query}”.</p>}
          {shown.map((thread) => (
            <ThreadRow
              key={thread.contact}
              thread={thread}
              name={nameOf(thread, door)}
              unread={door?.get(thread.contact)?.unread ?? 0}
              on={thread === open}
              onOpen={() => void navigate(`/a/${agent}/calls/${thread.latest.call}`)}
            />
          ))}
        </div>
      </div>
      {open === undefined ? (
        <div className="ib-thread">
          <p className="ib-nothing">{listed.error === null ? "Pick a conversation on the left." : ""}</p>
        </div>
      ) : (
        <OpenThread key={open.contact} agent={agent} thread={open} name={nameOf(open, door)} door={door !== null} />
      )}
    </div>
  );
}

function nameOf(thread: Thread, door: Map<string, DoorThread> | null): string {
  return door?.get(thread.contact)?.name ?? titleOf(thread);
}

// Asked once per agent and again when the calls it lists change; a gateway without the door answers
// 404 once and is not asked again on this screen.
function useDoorThreads(agent: string, moved: number): Map<string, DoorThread> | null {
  const credentials = useCredentials();
  const [threads, setThreads] = useState<Map<string, DoorThread> | null>(null);
  const [absent, setAbsent] = useState(false);
  useEffect(() => {
    if (absent) return;
    let gone = false;
    readDoorThreads(credentials, agent).then(
      (read) => {
        if (gone) return;
        if (read === null) setAbsent(true);
        setThreads(read);
      },
      () => undefined,
    );
    return () => {
      gone = true;
    };
  }, [credentials, agent, moved, absent]);
  return threads;
}

function ThreadRow({ thread, name, unread, on, onOpen }: { thread: Thread; name: string; unread: number; on: boolean; onOpen: () => void }): ReactNode {
  return (
    <button type="button" className={on ? "ib-row ib-row-on" : "ib-row"} onClick={onOpen}>
      <Avatar name={name} letters={lettersOf(thread)} size={36} round />
      <span className="ib-row-main">
        <span className="ib-row-top">
          <span className="ib-row-name">{name}</span>
          <span className="ib-row-time">{whenOf(thread.latest.started_at)}</span>
        </span>
        <span className="ib-row-bottom">
          <span className={thread.latest.status !== "ended" ? "ib-row-last ib-row-last-live" : "ib-row-last"}>{lastOf(thread)}</span>
          {unread > 0 && <span className="ib-unread">{unread}</span>}
        </span>
      </span>
    </button>
  );
}

// `13:24` today, `Yesterday`, then the day.
function whenOf(at: number | null): string {
  if (at === null) return "";
  const days = today();
  const day = utcDay(at);
  if (day === days.today) return clockOf(at).slice(0, 5);
  if (day === days.yesterday) return "Yesterday";
  return dayOf(at);
}

function OpenThread({ agent, thread, name, door }: { agent: string; thread: Thread; name: string; door: boolean }): ReactNode {
  const navigate = useNavigate();
  const credentials = useCredentials();
  const { messages, voice, loading, error } = useThread(thread);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const latest = thread.latest;
  const live = latest.status !== "ended";

  // Who may write, and where it goes: into the live text call as the agent, or — with the gateway's
  // door — into a closed WhatsApp thread inside its window. Everything else says why not.
  const into: "call" | "thread" | null = live && voice === false ? "call" : !live && door && latest.channel === "whatsapp" ? "thread" : null;
  const reason =
    into !== null
      ? `Write as ${agent} — the agent keeps the thread from here`
      : live && voice === true
        ? "A live voice call — Listen in on Live to speak into it"
        : live
          ? "Reading the call…"
          : "The conversation is closed — nothing can be written into it from here";

  const send = async (): Promise<void> => {
    if (into === null || text.trim() === "") return;
    setSending(true);
    setRefused(null);
    try {
      if (into === "call") await sayInto(credentials, latest.call, text.trim());
      else await writeTo(credentials, agent, thread.contact, text.trim());
      setText("");
    } catch (failed) {
      setRefused(failed instanceof GatewayError ? failed.message : String(failed));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="ib-thread">
      <div className="ib-head">
        <Avatar name={name} letters={lettersOf(thread)} size={38} round />
        <div className="ib-head-words">
          <div className="ib-head-name">{name}</div>
          <div className="ib-head-sub">
            {thread.handle !== name && `${thread.handle} · `}
            {latest.channel ?? "—"} · handled by {agent}
          </div>
        </div>
        <div className="ib-head-actions">
          {live && (
            <button type="button" className="ui-button ui-button-md" onClick={() => void navigate(`/live/${latest.call}`)}>
              Watch live
            </button>
          )}
          <button type="button" className="ui-button ui-button-md" onClick={() => void navigate(`/a/${agent}/sessions/${latest.call}`)}>
            Session
          </button>
        </div>
      </div>
      <div className="ib-messages">
        {error !== null && <p className="ib-refused-line">{error}</p>}
        {messages.length === 0 && error === null && <p className="ib-quiet">{loading ? "Reading the conversation…" : "Nothing was said in this conversation."}</p>}
        <Bubbles messages={messages} />
      </div>
      {refused !== null && <p className="ib-refused-line ib-refused-foot">{refused}</p>}
      <form
        className="ib-composer"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <input className="ib-write" value={text} placeholder={reason} disabled={into === null || sending} onChange={(event) => setText(event.target.value)} />
        <button type="submit" className="ib-send" disabled={into === null || sending || text.trim() === ""}>
          Send
        </button>
      </form>
    </div>
  );
}

// The day each message falls in heads its run: Today, Yesterday, or the date.
function Bubbles({ messages }: { messages: Message[] }): ReactNode {
  const days = today();
  let day = "";
  return (
    <>
      {messages.map((message, index) => {
        const on = utcDay(message.at);
        const heading = on !== day ? (on === days.today ? "Today" : on === days.yesterday ? "Yesterday" : dayOf(message.at)) : null;
        day = on;
        return (
          <div key={`${message.call}-${String(index)}`} className="ib-bubble-wrap">
            {heading !== null && <div className="ib-day">{heading}</div>}
            {message.kind === "call" ? (
              <div className="ib-line ib-line-call">
                <span className="ib-call">{message.text}</span>
              </div>
            ) : (
              <div className={message.kind === "out" ? "ib-line ib-line-out" : "ib-line"}>
                <span className={message.kind === "out" ? "ib-bubble ib-bubble-out" : "ib-bubble"}>
                  {message.text}
                  <span className="ib-time">{clockOf(message.at).slice(0, 5)}</span>
                </span>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
