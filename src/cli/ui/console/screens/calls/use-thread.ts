/** One thread's messages: each call's log read whole, once per seq it reached, merged in time order. */

import type { SessionLine } from "@pinecall/protocol";
import { useEffect, useRef, useState } from "react";

import { useCredentials } from "../../../shared/credentials";
import { wholeLog } from "../../lib/log-pages";
import { isVoice, messagesOf, type Message, type Thread } from "./threads";

// The newest calls of a thread and no more: a regular caller's year of calls is Sessions' to list.
const CALLS = 12;

/** What one call read to, kept by call id: a log that has not moved is not read again. */
interface Read {
  seq: number;
  voice: boolean;
  messages: Message[];
}

export interface ThreadMessages {
  messages: Message[];
  /** Whether the newest call carried voice — what decides whether a person can write into it. Null until its log is read. */
  voice: boolean | null;
  loading: boolean;
  error: string | null;
}

export function useThread(thread: Thread | undefined): ThreadMessages {
  const credentials = useCredentials();
  const kept = useRef<Map<string, Read>>(new Map());
  const [, setPainted] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lines: SessionLine[] = thread?.lines.slice(0, CALLS) ?? [];
  // The thread moves when one of its calls wrote something: that, and not the list's identity, is when to read.
  const wanted = lines.map((line) => `${line.call}@${line.last_seq}`).join(" ");

  useEffect(() => {
    let gone = false;
    const stale = lines.filter((line) => kept.current.get(line.call)?.seq !== line.last_seq);
    if (stale.length === 0) return;
    setLoading(true);
    void (async () => {
      try {
        await Promise.all(
          stale.map(async (line) => {
            const entries = await wholeLog(credentials, line.call);
            const voice = isVoice(line, entries);
            kept.current.set(line.call, { seq: line.last_seq, voice, messages: messagesOf(line, entries, voice) });
          }),
        );
        if (!gone) setError(null);
      } catch (refused) {
        if (!gone) setError(String(refused));
      } finally {
        if (!gone) {
          setLoading(false);
          setPainted((n) => n + 1);
        }
      }
    })();
    return () => {
      gone = true;
    };
  }, [wanted, credentials]);

  const messages = lines
    .flatMap((line) => kept.current.get(line.call)?.messages ?? [])
    .sort((a, b) => a.at - b.at);
  const newest = thread === undefined ? undefined : kept.current.get(thread.latest.call);
  return { messages, voice: newest?.voice ?? null, loading, error };
}
