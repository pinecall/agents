/** The Talk screen's room: a visit token from the gateway, the browser's microphone, and what is said as it is said. */

import type { Entry } from "@pinecall/protocol";
import { ParticipantKind, Room, RoomEvent, Track, type RemoteTrack, type TextStreamReader } from "livekit-client";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";

import { post } from "../../../shared/api";
import { useCredentials } from "../../../shared/credentials";
import {
  A_BEAT_MS,
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

/** The room as the screen reads it, and the two things it may do to it. */
export interface Talking {
  phase: Phase;
  call: string | null;
  lines: Line[];
  error: string | null;
  open: () => Promise<void>;
  close: () => Promise<void>;
  /** One entry of the call's log, for the marks the room itself does not carry. */
  heard: (entry: Entry) => void;
}

// What `POST /v1/tokens` answers: LiveKit's two fields, and the call the token opens.
const MintedSchema = z.object({ server_url: z.string(), participant_token: z.string(), call: z.string() });

/** Speak with one agent from this tab. The token is minted through the CLI, which holds the key. */
export function useRoom(agent: string): Talking {
  const credentials = useCredentials();
  const [phase, setPhase] = useState<Phase>("idle");
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

  const heard = useCallback(
    (entry: Entry): void => {
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

  const open = useCallback(async (): Promise<void> => {
    setPhase("connecting");
    setError(null);
    setLines([]);
    seen.current.clear();
    lastSpoken.current = null;
    waiting.current = [];
    try {
      const minted = MintedSchema.parse(await post(credentials, "/v1/tokens", { agent, scope: "talk" }));
      const joined = new Room();
      room.current = joined;
      // Registered before the room is joined: a handler registered after connect misses the first words.
      joined.registerTextStreamHandler(TRANSCRIPTION_TOPIC, (reader, from) => {
        void spoken(joined, reader, from.identity, said);
      });
      joined.on(RoomEvent.TrackSubscribed, playAloud);
      joined.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => track.detach().forEach((element) => element.remove()));
      joined.on(RoomEvent.Disconnected, () => setPhase("ended"));
      setCall(minted.call);
      await joined.connect(minted.server_url, minted.participant_token);
      await joined.localParticipant.setMicrophoneEnabled(true);
      setPhase("live");
    } catch (failed) {
      setError(failed instanceof Error ? failed.message : String(failed));
      setPhase("failed");
    }
  }, [agent, credentials, said]);

  const close = useCallback(async (): Promise<void> => {
    await room.current?.disconnect();
  }, []);

  // Leaving the screen hangs up: a room nobody is looking at is a call nobody is on.
  useEffect(() => {
    return () => {
      void room.current?.disconnect();
    };
  }, []);

  return { phase, call, lines, error, open, close, heard };
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
