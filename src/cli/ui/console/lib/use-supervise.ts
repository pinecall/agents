/** A supervisor's hands on a live call: the six verbs, and the microphone that takes the line. */

import { VerbSchema, type Verb } from "@pinecall/protocol";
import { Room, Track } from "livekit-client";
import { useCallback, useEffect, useRef, useState } from "react";

import { post, type Credentials } from "../../shared/api";
import { useCredentials } from "../../shared/credentials";
import { seatIn } from "./seat";

/** The desk as the panel reads it: the six moves, who holds the line, and the last refusal. */
export interface Supervising {
  whisper: (text: string) => Promise<void>;
  say: (text: string) => Promise<void>;
  takeOver: () => Promise<void>;
  release: () => Promise<void>;
  transfer: (to: string) => Promise<void>;
  end: () => Promise<void>;
  holding: boolean;
  error: string | null;
}

// Warm transfer needs a second leg the SIP stack does not have yet, and the door answers ONLY_COLD
// to anything else (the runtime's docs/decisions/supervise.md), so the desk asks for the one mode
// there is.
const THE_ONLY_MODE = "cold";

/**
 * One desk on one call: the seat it holds, the microphone it publishes, and the verbs it sends.
 * It is a plain object on purpose — the React hook below is a handful of lines over it, and this
 * is what a test drives.
 */
export class Desk {
  readonly #credentials: Credentials;
  readonly #call: string;
  #room: Room | null = null;

  constructor(credentials: Credentials, call: string) {
    this.#credentials = credentials;
    this.#call = call;
  }

  // The body is the protocol's own union, parsed here: a verb this console got wrong is a throw in
  // the page and not a 422 from a door three processes away.
  /** One verb onto the call, through the CLI's proxy, which puts the org key on the header. */
  async send(verb: Verb): Promise<void> {
    await post(this.#credentials, `/v1/calls/${this.#call}/verbs`, VerbSchema.parse(verb));
  }

  // livekit opens the microphone and publishes it in one call, and holds the publication itself:
  // `setMicrophoneEnabled` is that call (room/participant/LocalParticipant.d.ts:100).
  /** Take the line: the microphone into the room, and then the verb that quiets the agent. */
  async take(): Promise<void> {
    const room = await this.#seated();
    await room.localParticipant.setMicrophoneEnabled(true);
    await this.send({ verb: "takeover" });
  }

  /** Hand it back: the agent hears and speaks again, and this microphone stops publishing. */
  async give(): Promise<void> {
    await this.send({ verb: "release" });
    await this.#unpublish();
  }

  /** Leave the room. The seat is held for the life of the screen and let go with it. */
  async leave(): Promise<void> {
    await this.#unpublish();
    await this.#room?.disconnect();
    this.#room = null;
  }

  // The seat is minted once and kept: a takeover and the release that answers it are two clicks
  // minutes apart, and a second token would be a second participant sitting in the same room.
  async #seated(): Promise<Room> {
    if (this.#room !== null) {
      return this.#room;
    }
    const seat = await seatIn(this.#credentials, this.#call, "supervise");
    const room = new Room();
    // Nothing is subscribed: the ear is the listen seat's job (use-listen.ts), and a second
    // subscription here would be the same two voices played twice.
    await room.connect(seat.server_url, seat.participant_token, { autoSubscribe: false });
    this.#room = room;
    return room;
  }

  // Unpublished and stopped, never merely muted: a publication left in the room is a recording
  // light on the supervisor's laptop for a call they are no longer speaking into. The next
  // takeover opens a fresh microphone, which is what `setMicrophoneEnabled` does with none.
  async #unpublish(): Promise<void> {
    const me = this.#room?.localParticipant;
    const published = me?.getTrackPublication(Track.Source.Microphone);
    if (me === undefined || published?.track === undefined) {
      return;
    }
    await me.unpublishTrack(published.track, true);
  }
}

/** Supervise one call from this screen. Every refusal is the gateway's own sentence, kept here. */
export function useSupervise(call: string): Supervising {
  const credentials = useCredentials();
  const [holding, setHolding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const desk = useRef<Desk | null>(null);

  const held = useCallback((): Desk => {
    desk.current ??= new Desk(credentials, call);
    return desk.current;
  }, [call, credentials]);

  // Whatever the move, it lands in one place: the error cleared, the refusal shown in the
  // gateway's words, and `holding` moved only by a takeover or a release that was accepted.
  const moved = useCallback(
    async (move: (desk: Desk) => Promise<void>, line: boolean | null): Promise<void> => {
      setError(null);
      try {
        await move(held());
        if (line !== null) {
          setHolding(line);
        }
      } catch (refused) {
        setError(refused instanceof Error ? refused.message : String(refused));
      }
    },
    [held],
  );

  const whisper = useCallback((text: string) => moved((desk) => desk.send({ verb: "whisper", text }), null), [moved]);
  const say = useCallback((text: string) => moved((desk) => desk.send({ verb: "say", text }), null), [moved]);
  const takeOver = useCallback(() => moved((desk) => desk.take(), true), [moved]);
  const release = useCallback(() => moved((desk) => desk.give(), false), [moved]);
  const transfer = useCallback(
    (to: string) => moved((desk) => desk.send({ verb: "transfer", to, mode: THE_ONLY_MODE }), null),
    [moved],
  );
  const end = useCallback(() => moved((desk) => desk.send({ verb: "end" }), null), [moved]);

  // Leaving the screen leaves the room: a seat nobody is behind is a participant in a live call.
  useEffect(() => {
    return () => {
      void desk.current?.leave();
      desk.current = null;
    };
  }, []);

  return { whisper, say, takeOver, release, transfer, end, holding, error };
}
