// The DataChannel source: the two topics it hears, the one it asks on, and the envelope a guest gets.

import { RoomEvent, type Room } from "livekit-client";
import { describe, expect, it } from "vitest";

import { inRoom } from "../src/room-source.js";
import type { Snapshot, SourceReader } from "../src/source.js";

interface Published {
  topic: string | undefined;
  said: unknown;
}

// livekit's Room, down to what the source touches: on, off, the connection state, and publishData.
function aRoom(state: "connected" | "disconnected"): Room & { fire(event: string, ...args: unknown[]): void; published: Published[] } {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const published: Published[] = [];
  const room = {
    state,
    published,
    on(event: string, listener: (...args: unknown[]) => void): unknown {
      listeners.set(event, (listeners.get(event) ?? new Set()).add(listener));
      return room;
    },
    off(event: string, listener: (...args: unknown[]) => void): unknown {
      listeners.get(event)?.delete(listener);
      return room;
    },
    fire(event: string, ...args: unknown[]): void {
      for (const listener of listeners.get(event) ?? []) {
        listener(...args);
      }
    },
    localParticipant: {
      publishData(payload: Uint8Array, options: { topic?: string }): Promise<void> {
        published.push({ topic: options.topic, said: JSON.parse(new TextDecoder().decode(payload)) });
        return Promise.resolve();
      },
    },
  };
  return room as unknown as Room & { fire(event: string, ...args: unknown[]): void; published: Published[] };
}

function aReader(): SourceReader & { snapshots: Snapshot[]; seqs: number[]; closed: number; refused: string[] } {
  const reader = {
    snapshots: [] as Snapshot[],
    seqs: [] as number[],
    closed: 0,
    refused: [] as string[],
    onSnapshot(snapshot: Snapshot): void {
      reader.snapshots.push(snapshot);
    },
    onEntry(entry: { seq: number }): void {
      reader.seqs.push(entry.seq);
    },
    onClosed(): void {
      reader.closed += 1;
    },
    onRefused(why: string): void {
      reader.refused.push(why);
    },
  };
  return reader as typeof reader & SourceReader;
}

function packet(said: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(said));
}

describe("the room source", () => {
  it("hands over the snapshot and the log, and nothing published on another topic", () => {
    const room = aRoom("connected");
    const reader = aReader();
    inRoom(room).open(reader);
    room.fire(RoomEvent.DataReceived, packet({ state: { status: "active" }, last_seq: 3 }), undefined, undefined, "pinecall.snapshot");
    room.fire(RoomEvent.DataReceived, packet({ seq: 4, ts: 4, type: "user.state", ephemeral: false, data: { state: "speaking" } }), undefined, undefined, "pinecall.log");
    room.fire(RoomEvent.DataReceived, packet({ anything: true }), undefined, undefined, "pinecall.ui");
    expect(reader.snapshots).toEqual([{ state: { status: "active" }, last_seq: 3 }]);
    expect(reader.seqs).toEqual([4]);
    expect(reader.refused).toEqual([]);
  });

  it("asks for a replay on pinecall.replay, and only while the room is connected", () => {
    const connected = aRoom("connected");
    const source = inRoom(connected);
    source.open(aReader());
    source.replay(7);
    expect(connected.published).toEqual([{ topic: "pinecall.replay", said: { after: 7 } }]);

    const away = aRoom("disconnected");
    inRoom(away).replay(7);
    expect(away.published).toEqual([]);
  });

  it("says closed when the room disconnects, and hears nothing after it was let go", () => {
    const room = aRoom("connected");
    const reader = aReader();
    const stop = inRoom(room).open(reader);
    room.fire(RoomEvent.Disconnected);
    expect(reader.closed).toBe(1);
    stop();
    room.fire(RoomEvent.DataReceived, packet({ state: {}, last_seq: 1 }), undefined, undefined, "pinecall.snapshot");
    expect(reader.snapshots).toEqual([]);
  });

  it("refuses a frame that is not what the topic promised", () => {
    const room = aRoom("connected");
    const reader = aReader();
    inRoom(room).open(reader);
    room.fire(RoomEvent.DataReceived, new TextEncoder().encode("not json"), undefined, undefined, "pinecall.log");
    room.fire(RoomEvent.DataReceived, packet({ seq: "one" }), undefined, undefined, "pinecall.log");
    expect(reader.refused).toHaveLength(2);
    expect(reader.seqs).toEqual([]);
  });
});
