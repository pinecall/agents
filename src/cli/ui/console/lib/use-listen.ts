/** A supervisor's ear in a live call: a hidden, silent seat in the room, heard through this tab. */

import { Room, RoomEvent, Track, type RemoteTrack } from "livekit-client";
import { useCallback, useEffect, useRef, useState } from "react";

import { useCredentials } from "../../shared/credentials";
import { seatIn } from "./seat";

/** Where the ear stands. `off` is not in the room; `muted` is in it and reading; `on` hears it. */
export type Listening = "off" | "joining" | "muted" | "on" | "failed";

/** The ear as the screen reads it, and the three things it may do. */
export interface Ear {
  listening: Listening;
  error: string | null;
  /** Join the room, muted: a supervisor reads a call by default and only then chooses to hear it. */
  join: () => Promise<void>;
  /** Hear it, or stop hearing it, without leaving. */
  hear: (audible: boolean) => void;
  leave: () => Promise<void>;
}

/** Listen in on one call. The seat is minted through the CLI, which holds the key. */
export function useListen(call: string): Ear {
  const credentials = useCredentials();
  const [listening, setListening] = useState<Listening>("off");
  const [error, setError] = useState<string | null>(null);
  const room = useRef<Room | null>(null);
  const speakers = useRef<HTMLMediaElement[]>([]);

  const join = useCallback(async (): Promise<void> => {
    setListening("joining");
    setError(null);
    try {
      const seat = await seatIn(credentials, call, "listen");
      const joined = new Room();
      room.current = joined;
      // Every audio track — the caller's and the agent's — attached to the document, muted: the
      // element lives in the document because a detached one is at the mercy of autoplay rules.
      joined.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        if (track.kind !== Track.Kind.Audio) return;
        const element = track.attach();
        element.muted = true;
        element.style.display = "none";
        document.body.append(element);
        speakers.current.push(element);
      });
      joined.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
        for (const element of track.detach()) {
          element.remove();
          speakers.current = speakers.current.filter((kept) => kept !== element);
        }
      });
      joined.on(RoomEvent.Disconnected, () => setListening("off"));
      await joined.connect(seat.server_url, seat.participant_token);
      setListening("muted");
    } catch (failed) {
      setError(failed instanceof Error ? failed.message : String(failed));
      setListening("failed");
    }
  }, [call, credentials]);

  const hear = useCallback((audible: boolean): void => {
    for (const element of speakers.current) element.muted = !audible;
    setListening(audible ? "on" : "muted");
  }, []);

  const leave = useCallback(async (): Promise<void> => {
    await room.current?.disconnect();
    room.current = null;
  }, []);

  // Leaving the screen leaves the room: an ear nobody is behind is a seat nobody should hold.
  useEffect(() => {
    return () => {
      void room.current?.disconnect();
    };
  }, []);

  return { listening, error, join, hear, leave };
}
