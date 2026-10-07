// Pins the exports of `pinecall/client` and `pinecall/client/testing`.

import { describe, expect, it } from "vitest";

import * as client from "../../src/client/index.js";
import * as testing from "../../src/client/testing/index.js";

// Sorted.
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
  "aLostSocket",
  "agentLogUrl",
  "appsUrl",
  "callLogUrl",
  "camelEvent",
  "frame",
  "history",
  "lookupUrl",
  "nextId",
  "observe",
];

// Test doubles; never imported by a published app at runtime.
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
