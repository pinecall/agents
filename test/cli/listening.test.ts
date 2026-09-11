// `--listen`: the ear the terminal takes in a live call. What is pinned here is everything around
// the room — which player is spoken to, what is said when there is none, and the knocking that
// makes the ear land on the greeting rather than on the third turn.

import { existsSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { aSeatIn, anEarIn, EAR, NO_PLAYER } from "../../src/cli/listening.js";
import { written } from "./said.js";

const A_KEY = "pk_the_orgs_key";
const CALL = "call_abc";
const SEAT = { server_url: "ws://127.0.0.1:7880", participant_token: "a.room.token", identity: "sup_1" };

/** A gateway whose listen door refuses until the room is open, and answers a seat after that. */
class FakeGateway {
  refusals = 0;
  asked = 0;
  #server!: Server;
  url = "";

  async open(): Promise<void> {
    this.#server = createServer((request, response) => {
      this.asked += 1;
      if (this.refusals > 0) {
        this.refusals -= 1;
        response.writeHead(404, { "content-type": "application/json" });
        response.end(JSON.stringify({ detail: `no call ${CALL}` }));
        return;
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(SEAT));
    });
    await new Promise<void>((bound) => this.#server.listen(0, "127.0.0.1", bound));
    this.url = `http://127.0.0.1:${(this.#server.address() as AddressInfo).port}`;
  }

  async close(): Promise<void> {
    this.#server.closeAllConnections();
    await new Promise<void>((closed) => this.#server.close(() => closed()));
  }
}

let gateway: FakeGateway;

beforeEach(async () => {
  gateway = new FakeGateway();
  await gateway.open();
});

afterEach(async () => {
  await gateway.close();
});

describe("the seat", () => {
  it("is knocked for until the room opens, and is the listen door's own answer", async () => {
    gateway.refusals = 2;

    const seat = await aSeatIn({ url: gateway.url, apiKey: A_KEY }, CALL);

    expect(seat).toEqual(SEAT);
    expect(gateway.asked).toBe(3);
  });
});

describe("what plays it", () => {
  // The four are named in the sentence, because a machine with none of them is a machine somebody
  // has to install one on, and "no player" without the names is a sentence nobody can act on.
  it("names every player it can write to, and what installs one", () => {
    expect(NO_PLAYER).toContain("ffplay");
    expect(NO_PLAYER).toContain("play");
    expect(NO_PLAYER).toContain("aplay");
    expect(NO_PLAYER).toContain("pw-play");
    expect(NO_PLAYER).toContain("install");
  });

  it("says so before it asks the gateway for anything, when this machine has none", async () => {
    const path = process.env["PATH"];
    process.env["PATH"] = "";
    try {
      await expect(anEarIn({ url: gateway.url, apiKey: A_KEY }, CALL, written().stream)).rejects.toThrow(NO_PLAYER);
      expect(gateway.asked).toBe(0);
    } finally {
      process.env["PATH"] = path;
    }
  });
});

describe("the ear", () => {
  // The room is joined in a program beside this module, named off this module's own extension: a
  // rename of either file, or a build that forgot to copy one, is a `--listen` that starts nothing.
  it("is a program that sits beside listening, under the same extension", () => {
    expect(EAR.endsWith("/ear.ts") || EAR.endsWith("/ear.js")).toBe(true);
    expect(existsSync(EAR)).toBe(true);
  });
});
