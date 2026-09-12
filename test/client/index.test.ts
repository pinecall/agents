// The public surface of `pinecall/client` and `pinecall/client/testing`, pinned: what an app that
// wants the socket and none of the framework can reach, by name. The two doors are listed apart
// because they are two installs' worth of intent — one ships, the other is only ever a test's.

import { describe, expect, it } from "vitest";

import * as client from "../../src/client/index.js";
import * as testing from "../../src/client/testing/index.js";

// Sorted, so the list reads as a list and a new name lands where it belongs rather than at the end.
const PUBLIC = [
  "Agent",
  "Call",
  "CallBook",
  "Connection",
  "DevRefused",
  "Listeners",
  "Pinecall",
  "PinecallError",
  "Refused",
  "agentLogUrl",
  "appsUrl",
  "callLogUrl",
  "camelEvent",
  "frame",
  "history",
  "nextId",
  "observe",
];

// The gateway and the log that are not there. They exist so a tenant's own suite needs neither,
// and they are the one part of this package a published app must never reach for at runtime.
const TESTING = ["FakeGateway", "FakeLog"];

describe("pinecall/client", () => {
  it("exports exactly what is listed here", () => {
    expect(Object.keys(client).sort()).toEqual(PUBLIC);
  });

  it("keeps the fakes on their own door", () => {
    expect(Object.keys(testing).sort()).toEqual(TESTING);
    for (const name of TESTING) expect(PUBLIC).not.toContain(name);
  });
});
