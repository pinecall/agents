// Whether the call a person typed is one this gateway has, before any verb acts as though it is.

import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CannotRun } from "../../src/cli/cannot-run.js";
import { standingOf } from "../../src/cli/the-call.js";
import type { Door } from "../../src/cli/testing/gateway.js";

let server: Server;
let door: Door;
let answer: { status: number; body: unknown } = { status: 200, body: {} };
const asked: string[] = [];

beforeEach(async () => {
  asked.length = 0;
  server = createServer((request, response) => {
    asked.push(request.url ?? "");
    response.writeHead(answer.status, { "content-type": "application/json" });
    response.end(JSON.stringify(answer.body));
  });
  await new Promise<void>((bound) => server.listen(0, "127.0.0.1", bound));
  door = { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, apiKey: "pc_a_key" } as Door;
});

afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((closed) => server.close(() => closed()));
});

describe("the call a verb was given", () => {
  it("is read off the one door that knows whether there is a log at all", async () => {
    answer = { status: 200, body: { live: true, last_seq: 58 } };

    expect(await standingOf(door, "call_e824")).toEqual({ live: true, lastSeq: 58 });
    expect(asked[0]).toBe("/v1/calls/call_e824/state");
  });

  // `sessions show CA_typo` printed a summary of nothing and left with a zero, because the events
  // door answers an empty page for a call nobody ever opened (production, 2026-09-20).
  it("cannot run when the gateway has no log under that id, and says the id back", async () => {
    answer = { status: 404, body: { detail: "no log for call CA_typo" } };

    await expect(standingOf(door, "CA_typo")).rejects.toThrow(CannotRun);
    await expect(standingOf(door, "CA_typo")).rejects.toThrow("no call CA_typo on this gateway");
  });

  it("lets every other refusal through as the gateway's own", async () => {
    answer = { status: 403, body: { detail: "that call belongs to another org" } };

    await expect(standingOf(door, "call_x")).rejects.toThrow("that call belongs to another org");
  });
});
