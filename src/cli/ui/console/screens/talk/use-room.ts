/** The Talk screen's room: a visit token from the gateway — a voice call or a written chat — and what is said as it is said. */

import type { Entry } from "@pinecall/protocol";
import { ParticipantKind, Room, RoomEvent, Track, type RemoteTrack, type TextStreamReader } from "livekit-client";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";

import { post } from "../../../shared/api";
import { useCredentials } from "../../../shared/credentials";
import {
  A_BEAT_MS,
  CHAT_TOPIC,
  markOf,
  SEGMENT_ID,
  TRANSCRIPTION_FINAL,
  TRANSCRIPTION_TOPIC,
  upsert,
  type Line,
  type Said,
  type Speaker,
} from "./transcript";

/** Where the conversation stands. `ended` keeps the transcript; `open` starts a new call. */
export type Phase = "idle" | "connecting" | "live" | "ended" | "failed";

/**
 * How the room is joined: `talk` with the microphone and the agent's voice, `chat` written — the
 * session then has no ears and no voice, and the agent's words arrive at the pace it writes them.
 */
export type Mode = "talk" | "chat";

/** The room as the screen reads it, and the two things it may do to it. */
export interface Talking {
  phase: Phase;
  mode: Mode;
  call: string | null;
  lines: Line[];
  error: string | null;
  /** When the room was joined, in seconds, for the clock. */
  since: number | null;
  /** Whether the microphone is off, on a voice call. */
  muted: boolean;
  open: (mode: Mode) => Promise<void>;
  close: () => Promise<void>;
  /** The microphone off, or on again: the call goes on either way. */
  toggleMic: () => Promise<void>;
  /** Write a line into the call instead of saying it. The agent answers it as it answers a spoken turn. */
  write: (text: string) => Promise<void>;
  /** One entry of the call's log, for the marks the room itself does not carry. */
  heard: (entry: Entry) => void;
}

// What `POST /v1/tokens` answers: LiveKit's two fields, and the call the token opens.
const MintedSchema = z.object({ server_url: z.string(), participant_token: z.string(), call: z.string() });

/** Speak with one agent from this tab. The token is minted through the CLI, which holds the key. */
export function useRoom(agent: string): Talking {
  const credentials = useCredentials();
  const [phase, setPhase] = useState<Phase>("idle");
  const [mode, setMode] = useState<Mode>("talk");
  const [since, setSince] = useState<number | null>(null);
  const [muted, setMuted] = useState(false);
  const [call, setCall] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [error, setError] = useState<string | null>(null);
  const room = useRef<Room | null>(null);
  const seen = useRef(new Set<string>());
  const lastSpoken = useRef<Speaker | null>(null);
  const waiting = useRef<Line[]>([]);
  const grace = useRef<number | null>(null);

  // The marks held back are placed at the end, in the order they arrived.
  const place = useCallback((): void => {
    if (grace.current !== null) {
      window.clearTimeout(grace.current);
      grace.current = null;
    }
    const held = waiting.current;
    waiting.current = [];
    if (held.length > 0) setLines((known) => [...known, ...held]);
  }, []);

  // A new segment of the caller's is placed after the marks that came before it; a new segment
  // of the agent's is placed before them, because they are what that sentence announced.
  const said = useCallback(
    (line: Said): void => {
      if (!seen.current.has(line.id)) {
        seen.current.add(line.id);
        if (line.speaker === "user") place();
        setLines((known) => upsert(known, line));
        lastSpoken.current = line.speaker;
        if (line.speaker === "agent") place();
        return;
      }
      setLines((known) => upsert(known, line));
    },
    [place],
  );

  const typed = useRef(0);

  // A written line is on screen at once, dimmed, and settles when the log's turn.user carries it.
  // A refusal takes it back and says why.
  const write = useCallback(
    async (text: string): Promise<void> => {
      const joined = room.current;
      if (joined === null) return;
      typed.current += 1;
      const id = `typed-${typed.current}`;
      place();
      setLines((known) => [...known, { kind: "said", id, speaker: "user", text, final: true, pending: true }]);
      lastSpoken.current = "user";
      try {
        await joined.localParticipant.sendText(text, { topic: CHAT_TOPIC });
      } catch (failed) {
        setLines((known) => known.filter((line) => line.id !== id));
        setError(failed instanceof Error ? failed.message : String(failed));
      }
    },
    [place],
  );

  const heard = useCallback(
    (entry: Entry): void => {
      if (entry.type === "turn.user") {
        const said = String((entry.data as Record<string, unknown>)["text"] ?? "").trim();
        setLines((known) => {
          const at = known.findIndex((line) => line.kind === "said" && line.pending === true && line.text.trim() === said);
          if (at === -1) return known;
          const next = known.slice();
          next[at] = { ...(known[at] as Said), pending: false };
          return next;
        });
        return;
      }
      const mark = markOf(entry);
      if (mark === null) return;
      if (lastSpoken.current === "agent") {
        setLines((known) => [...known, mark]);
        return;
      }
      waiting.current.push(mark);
      if (grace.current !== null) window.clearTimeout(grace.current);
      grace.current = window.setTimeout(place, A_BEAT_MS);
    },
    [place],
  );

  const open = useCallback(async (joining: Mode): Promise<void> => {
    setPhase("connecting");
    setMode(joining);
    setMuted(false);
    setSince(null);
    setError(null);
    setLines([]);
    seen.current.clear();
    lastSpoken.current = null;
    waiting.current = [];
    try {
      const minted = MintedSchema.parse(await post(credentials, "/v1/tokens", { agent, scope: joining }));
      const joined = new Room();
      room.current = joined;
      // Registered before the room is joined: a handler registered after connect misses the first words.
      joined.registerTextStreamHandler(TRANSCRIPTION_TOPIC, (reader, from) => {
        void spoken(joined, reader, from.identity, said);
      });
      // A chat hears the room only for its text: no voice is attached, whatever arrives.
      if (joining === "talk") joined.on(RoomEvent.TrackSubscribed, playAloud);
      joined.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => track.detach().forEach((element) => element.remove()));
      joined.on(RoomEvent.Disconnected, () => setPhase("ended"));
      setCall(minted.call);
      await joined.connect(minted.server_url, minted.participant_token);
      if (joining === "talk") await joined.localParticipant.setMicrophoneEnabled(true);
      setSince(Date.now() / 1000);
      setPhase("live");
    } catch (failed) {
      setError(failed instanceof Error ? failed.message : String(failed));
      setPhase("failed");
    }
  }, [agent, credentials, said]);

  const close = useCallback(async (): Promise<void> => {
    await room.current?.disconnect();
  }, []);

  const toggleMic = useCallback(async (): Promise<void> => {
    const joined = room.current;
    if (joined === null) return;
    await joined.localParticipant.setMicrophoneEnabled(muted);
    setMuted(!muted);
  }, [muted]);

  // Leaving the screen hangs up: a room nobody is looking at is a call nobody is on.
  useEffect(() => {
    return () => {
      void room.current?.disconnect();
    };
  }, []);

  return { phase, mode, call, lines, error, since, muted, open, close, toggleMic, write, heard };
}

// One segment from its first delta to the trailer that settles it. A segment's line is the text
// of the most recent stream carrying its id: the caller's final replaces the interim, the agent's
// single stream grows word by word. `attributes` tells the truth about `final` only after the
// iteration ends — during the loop it always says "false".
async function spoken(
  room: Room,
  reader: TextStreamReader,
  identity: string,
  said: (line: Said) => void,
): Promise<void> {
  const id = reader.info.attributes?.[SEGMENT_ID] ?? reader.info.id;
  const speaker: Speaker = room.remoteParticipants.get(identity)?.kind === ParticipantKind.AGENT ? "agent" : "user";
  let text = "";
  for await (const chunk of reader) {
    text += chunk;
    said({ kind: "said", id, speaker, text, final: false });
  }
  said({ kind: "said", id, speaker, text, final: reader.info.attributes?.[TRANSCRIPTION_FINAL] === "true" });
}

// The agent's voice arrives as a subscribed audio track; attaching it is what plays it. The
// element lives in the document — a detached one is at the mercy of the browser's autoplay rules —
// but never on screen: audio is not a widget, it is the call.
function playAloud(track: RemoteTrack): void {
  if (track.kind !== Track.Kind.Audio) return;
  const element = track.attach();
  element.style.display = "none";
  document.body.append(element);
}
