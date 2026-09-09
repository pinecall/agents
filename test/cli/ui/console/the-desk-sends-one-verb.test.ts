/** The desk, driven with a stubbed door and a stubbed room: what leaves the page, and how often. */

import { beforeEach, expect, test, vi } from "vitest";

// The room is livekit's, and none of it may run in a test: what matters here is that the desk asks
// for a seat once, opens the microphone through livekit's own call, and stops it when it lets go.
const room = {
  connected: [] as [string, string][],
  microphone: 0,
  unpublished: [] as boolean[],
  disconnected: 0,
};

vi.mock("livekit-client", () => {
  class StubbedRoom {
    localParticipant = {
      setMicrophoneEnabled: (on: boolean): Promise<void> => {
        if (on) room.microphone += 1;
        return Promise.resolve();
      },
      getTrackPublication: (): { track: object } | undefined =>
        room.microphone > room.unpublished.length ? { track: {} } : undefined,
      unpublishTrack: (_track: object, stop: boolean): Promise<void> => {
        room.unpublished.push(stop);
        return Promise.resolve();
      },
    };

    connect(url: string, token: string): Promise<void> {
      room.connected.push([url, token]);
      return Promise.resolve();
    }

    disconnect(): Promise<void> {
      room.disconnected += 1;
      return Promise.resolve();
    }
  }
  return { Room: StubbedRoom, Track: { Source: { Microphone: "microphone" } } };
});

const { Desk } = await import("../../../../src/cli/ui/console/lib/use-supervise");

const CREDENTIALS = { base: "/nonce" };
const CALL = "call_9f2a";

// What the doors answered, and what was asked of them: one entry per call, in order.
let asked: { url: string; method: string; body: unknown }[] = [];
let answers: { status: number; body: unknown }[] = [];

beforeEach(() => {
  asked = [];
  answers = [];
  room.connected = [];
  room.microphone = 0;
  room.unpublished = [];
  room.disconnected = 0;
  // The page builds every door against the origin it was served from, and sends no key: the CLI
  // in front of it puts the org key on the header (lib/api.ts).
  vi.stubGlobal("window", { location: { origin: "http://127.0.0.1:53211" } });
  vi.stubGlobal("fetch", (door: URL, sent: { method: string; body: string }) => {
    asked.push({ url: door.toString(), method: sent.method, body: JSON.parse(sent.body) });
    const answer = answers.shift() ?? { status: 202, body: {} };
    return Promise.resolve({
      ok: answer.status < 300,
      status: answer.status,
      statusText: "",
      json: () => Promise.resolve(answer.body),
    });
  });
});

test("a whisper is one post of the protocol's own verb to that call's door", async () => {
  await new Desk(CREDENTIALS, CALL).send({ verb: "whisper", text: "hay un hueco a las 15:40" });
  expect(asked).toEqual([
    {
      url: `http://127.0.0.1:53211/nonce/v1/calls/${CALL}/verbs`,
      method: "POST",
      body: { verb: "whisper", text: "hay un hueco a las 15:40" },
    },
  ]);
});

test("the page never sends a verb the protocol does not know", async () => {
  const desk = new Desk(CREDENTIALS, CALL);
  await expect(desk.send({ verb: "shout", text: "!" } as never)).rejects.toThrow();
  expect(asked).toEqual([]);
});

test("a refused verb comes back in the gateway's own words", async () => {
  answers = [{ status: 409, body: { detail: "the call has ended" } }];
  await expect(new Desk(CREDENTIALS, CALL).send({ verb: "end" })).rejects.toThrow("the call has ended");
});

test("taking the line twice mints one seat and opens the microphone each time", async () => {
  answers = [
    { status: 200, body: { server_url: "ws://127.0.0.1:7880", participant_token: "a-room-token", identity: "sup_a1" } },
    { status: 202, body: {} },
    { status: 202, body: {} },
  ];
  const desk = new Desk(CREDENTIALS, CALL);
  await desk.take();
  await desk.take();

  expect(asked.map((one) => one.url.split("/").pop())).toEqual(["supervise", "verbs", "verbs"]);
  expect(asked.slice(1).map((one) => one.body)).toEqual([{ verb: "takeover" }, { verb: "takeover" }]);
  expect(room.connected).toEqual([["ws://127.0.0.1:7880", "a-room-token"]]);
  expect(room.microphone).toBe(2);
});

test("handing the line back tells the call first and stops the microphone after", async () => {
  answers = [
    { status: 200, body: { server_url: "ws://127.0.0.1:7880", participant_token: "a-room-token", identity: "sup_a1" } },
    { status: 202, body: {} },
    { status: 202, body: {} },
  ];
  const desk = new Desk(CREDENTIALS, CALL);
  await desk.take();
  await desk.give();

  expect(asked.at(-1)?.body).toEqual({ verb: "release" });
  expect(room.unpublished).toEqual([true]);
  expect(room.disconnected).toBe(0);
});

test("leaving the screen leaves the room", async () => {
  answers = [
    { status: 200, body: { server_url: "ws://127.0.0.1:7880", participant_token: "a-room-token", identity: "sup_a1" } },
    { status: 202, body: {} },
  ];
  const desk = new Desk(CREDENTIALS, CALL);
  await desk.take();
  await desk.leave();

  expect(room.unpublished).toEqual([true]);
  expect(room.disconnected).toBe(1);
});
