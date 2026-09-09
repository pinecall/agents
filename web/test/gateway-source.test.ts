// The gateway source, against the two browser primitives it is built on: fetch for the state door, EventSource for the tail.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { overGateway } from "../src/gateway-source.js";
import type { Snapshot, SourceReader } from "../src/source.js";

// The browser's EventSource, down to what the source uses of it: the URL it opened, the named
// listeners it registered, close, and the readyState an error is read against.
class FakeEventSource {
  static readonly CLOSED = 2;
  static opened: FakeEventSource[] = [];
  readonly listeners = new Map<string, (frame: MessageEvent<string>) => void>();
  readyState = 0;
  onerror: (() => void) | null = null;

  constructor(readonly url: string | URL) {
    FakeEventSource.opened.push(this);
  }

  addEventListener(type: string, listener: (frame: MessageEvent<string>) => void): void {
    this.listeners.set(type, listener);
  }

  close(): void {
    this.readyState = FakeEventSource.CLOSED;
  }

  /** One named frame, as the gateway's sink writes it. */
  frame(type: string, said: unknown): void {
    this.listeners.get(type)?.(new MessageEvent("message", { data: JSON.stringify(said) }));
  }

  /** The gateway answered 204 on reconnect: the browser gives up for good. */
  end(): void {
    this.readyState = FakeEventSource.CLOSED;
    this.onerror?.();
  }
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

const THE_CALL = { url: "https://gateway.example/", call: "call_1", token: "tok_visit" };

function stateDoor(answer: { status: number; body?: unknown }): ReturnType<typeof vi.fn> {
  const fetched = vi.fn(() =>
    Promise.resolve({
      status: answer.status,
      ok: answer.status < 300,
      json: () => Promise.resolve(answer.body),
    }),
  );
  vi.stubGlobal("fetch", fetched);
  return fetched;
}

async function settled(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  FakeEventSource.opened = [];
  vi.stubGlobal("EventSource", FakeEventSource);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the gateway source", () => {
  it("reads the state with the token in the header, then tails from last_seq with it on the query", async () => {
    const fetched = stateDoor({ status: 200, body: { state: { status: "active" }, last_seq: 9, live: true } });
    const reader = aReader();
    overGateway(THE_CALL).open(reader);
    await settled();

    const [url, init] = fetched.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://gateway.example/v1/calls/call_1/state");
    expect((init.headers as Record<string, string>)["authorization"]).toBe("Bearer tok_visit");
    expect(reader.snapshots).toEqual([{ state: { status: "active" }, last_seq: 9 }]);

    const tail = FakeEventSource.opened[0] as FakeEventSource;
    expect(tail.url.toString()).toBe("https://gateway.example/v1/calls/call_1/events?after=9&token=tok_visit");
    tail.frame("user.state", { seq: 10, ts: 10, type: "user.state", ephemeral: false, data: { state: "speaking" } });
    expect(reader.seqs).toEqual([10]);
  });

  it("tails from the first entry when the log does not exist yet", async () => {
    stateDoor({ status: 404 });
    const reader = aReader();
    overGateway(THE_CALL).open(reader);
    await settled();
    expect(reader.snapshots).toEqual([]);
    expect(reader.refused).toEqual([]);
    expect((FakeEventSource.opened[0] as FakeEventSource).url.toString()).toContain("after=0");
  });

  it("says closed without opening a tail when the state door says the log is over", async () => {
    stateDoor({ status: 200, body: { state: { status: "ended" }, last_seq: 40, live: false } });
    const reader = aReader();
    overGateway(THE_CALL).open(reader);
    await settled();
    expect(reader.closed).toBe(1);
    expect(FakeEventSource.opened).toEqual([]);
  });

  it("refuses any other answer of the state door, by status", async () => {
    stateDoor({ status: 403 });
    const reader = aReader();
    overGateway(THE_CALL).open(reader);
    await settled();
    expect(reader.refused).toEqual(["GET /v1/calls/call_1/state: the gateway answered 403"]);
  });

  it("replays by closing the tail and opening the same door from the cursor asked", async () => {
    stateDoor({ status: 404 });
    const source = overGateway(THE_CALL);
    source.open(aReader());
    await settled();
    source.replay(4);
    const [first, second] = FakeEventSource.opened as [FakeEventSource, FakeEventSource];
    expect(first.readyState).toBe(FakeEventSource.CLOSED);
    expect(second.url.toString()).toContain("after=4");
  });

  it("says closed when the browser gave up on the stream, and only for the tail it holds", async () => {
    stateDoor({ status: 404 });
    const reader = aReader();
    const source = overGateway(THE_CALL);
    source.open(reader);
    await settled();
    const first = FakeEventSource.opened[0] as FakeEventSource;
    source.replay(2);
    first.end();
    expect(reader.closed).toBe(0);
    (FakeEventSource.opened[1] as FakeEventSource).end();
    expect(reader.closed).toBe(1);
  });

  it("hears nothing after it was let go", async () => {
    stateDoor({ status: 404 });
    const reader = aReader();
    const stop = overGateway(THE_CALL).open(reader);
    await settled();
    const tail = FakeEventSource.opened[0] as FakeEventSource;
    stop();
    expect(tail.readyState).toBe(FakeEventSource.CLOSED);
    tail.frame("user.state", { seq: 1, ts: 1, type: "user.state", ephemeral: false, data: { state: "speaking" } });
    expect(reader.seqs).toEqual([]);
  });
});
