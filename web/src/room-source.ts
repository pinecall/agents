// The call's log over livekit's DataChannel: what the worker sends a widget in the room, and the one thing it asks back.

import { ConnectionState, RoomEvent, type RemoteParticipant, type Room } from "livekit-client";

import type { CallSource, SourceReader } from "./source.js";
import { publicEntry, publicSnapshot } from "./wire.js";

// The topics, as docs/protocol/projections.md names them. The worker is the room's authority: it
// greets a widget with the snapshot, tails the log to it, and answers a replay with what it missed.
const SNAPSHOT = "pinecall.snapshot";
const LOG = "pinecall.log";
const REPLAY = "pinecall.replay";

/** The log as the worker publishes it to this seat. The snapshot arrives on join, unasked. */
export function inRoom(room: Room): CallSource {
  let reader: SourceReader | null = null;
  return {
    open(opened) {
      reader = opened;
      const received = (payload: Uint8Array, _from?: RemoteParticipant, _kind?: unknown, topic?: string): void => {
        if (topic === SNAPSHOT || topic === LOG) {
          deliver(opened, topic, payload);
        }
      };
      const left = (): void => opened.onClosed();
      room.on(RoomEvent.DataReceived, received);
      room.on(RoomEvent.Disconnected, left);
      return () => {
        room.off(RoomEvent.DataReceived, received);
        room.off(RoomEvent.Disconnected, left);
        reader = null;
      };
    },
    // A room not yet connected has nobody to ask: the worker's greeting brings the snapshot when
    // it arrives, and the gap that prompted this closes with it.
    replay(after) {
      if (room.state !== ConnectionState.Connected) {
        return;
      }
      const asked = new TextEncoder().encode(JSON.stringify({ after }));
      room.localParticipant
        .publishData(asked, { reliable: true, topic: REPLAY })
        .catch((failed: unknown) => reader?.onRefused(`${REPLAY}: ${String(failed)}`));
    },
  };
}

function deliver(reader: SourceReader, topic: string, payload: Uint8Array): void {
  try {
    const said: unknown = JSON.parse(new TextDecoder().decode(payload));
    if (topic === SNAPSHOT) {
      reader.onSnapshot(publicSnapshot(said));
    } else {
      reader.onEntry(publicEntry(said));
    }
  } catch (refused) {
    reader.onRefused(`${topic}: ${String(refused)}`);
  }
}
