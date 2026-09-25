// `pinecall voices`: a vendor's voices one per line, the id first, kept to one country; and one
// voice said by the gateway, played here, with the vendor's two numbers beside it.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { aDuration, run } from "../../src/cli/voices.js";
import { pointingAt } from "./home.js";
import { written } from "./said.js";

const A_KEY = "pk_the_orgs_own_key";
const MARTA = "de38f545-c574-44e8-9b54-a7d6fec1c6b1";
const A_WAV = Buffer.from("RIFF....WAVEfmt ");

const VOICES = [
  { id: MARTA, name: "Marta - Friendly Guide", language: "es", gender: "feminine", country: "ES", accent: "castilian", description: "" },
  { id: "2fc4f1ec", name: "Mateo - Friendly Host", language: "es", gender: "masculine", country: "MX", accent: "", description: "" },
];

/** One request as the gateway heard it. */
interface Heard {
  method: string;
  path: string;
  body: unknown;
}

/** The two voice doors: the list, and a sample answered as a WAV with Server-Timing. */
class FakeGateway {
  readonly heard: Heard[] = [];
  refuse: { status: number; detail: string } | undefined;
  #server!: Server;
  url = "";

  async open(): Promise<void> {
    this.#server = createServer((request, response) => void this.#answer(request, response));
    await new Promise<void>((bound) => this.#server.listen(0, "127.0.0.1", bound));
    this.url = `http://127.0.0.1:${(this.#server.address() as AddressInfo).port}`;
  }

  async close(): Promise<void> {
    this.#server.closeAllConnections();
    await new Promise<void>((closed) => this.#server.close(() => closed()));
  }

  async #answer(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(chunk as Buffer);
    const text = Buffer.concat(chunks).toString("utf8");
    this.heard.push({ method: request.method ?? "", path: request.url ?? "", body: text === "" ? null : JSON.parse(text) });
    if (this.refuse !== undefined) {
      response.writeHead(this.refuse.status, { "content-type": "application/json" });
      response.end(JSON.stringify({ detail: this.refuse.detail }));
      return;
    }
    if (request.method === "POST") {
      response.writeHead(200, { "content-type": "audio/wav", "server-timing": "first-audio;dur=210, total;dur=900" });
      response.end(A_WAV);
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ tts: "cartesia", language: "es", voices: VOICES }));
  }
}

const gateway = new FakeGateway();
let env: NodeJS.ProcessEnv;

beforeEach(async () => {
  gateway.heard.length = 0;
  gateway.refuse = undefined;
  await gateway.open();
  env = pointingAt(gateway.url, A_KEY);
});

afterEach(async () => {
  await gateway.close();
});

describe("listing", () => {
  it("asks Cartesia when no vendor is named, and prints the id first", async () => {
    const out = written();

    const code = await run(["--language", "es"], { out: out.stream, env });

    expect(code).toBe(0);
    expect(gateway.heard[0]!.path).toBe("/v1/voices?tts=cartesia&language=es");
    const lines = out.text().trimEnd().split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]!.startsWith(MARTA)).toBe(true);
    expect(lines[0]).toContain("ES castilian");
  });

  it("keeps only the voices from one country, whatever case it was typed in", async () => {
    const out = written();

    await run(["--country", "es"], { out: out.stream, env });

    expect(out.text()).toContain("Marta");
    expect(out.text()).not.toContain("Mateo");
  });

  it("says the gateway's own refusal", async () => {
    gateway.refuse = { status: 409, detail: "no key for cartesia" };
    const err = written();

    const code = await run([], { err: err.stream, env });

    expect(code).toBe(1);
    expect(err.text()).toContain("no key for cartesia");
  });
});

describe("playing", () => {
  it("sends the voice and the words, plays the WAV and prints the two numbers", async () => {
    const out = written();
    const played: Uint8Array[] = [];

    const code = await run(["play", MARTA, "Hola", "--model", "sonic-3", "--language", "es"], {
      out: out.stream,
      env,
      play: (wav) => {
        played.push(wav);
        return "afplay";
      },
    });

    expect(code).toBe(0);
    expect(gateway.heard[0]).toMatchObject({
      method: "POST",
      path: "/v1/voices/sample",
      body: { tts: "cartesia", voice: MARTA, model: "sonic-3", language: "es", text: "Hola" },
    });
    expect(Buffer.from(played[0]!)).toEqual(A_WAV);
    expect(out.text()).toBe(`${MARTA} · first audio 210 ms · whole sentence 900 ms · afplay\n`);
  });

  it("wants a voice, and says how to ask", async () => {
    const err = written();

    const code = await run(["play"], { err: err.stream, env });

    expect(code).toBe(2);
    expect(err.text()).toContain("pinecall voices play <voice>");
    expect(gateway.heard).toHaveLength(0);
  });

  it("says a vendor's refusal and plays nothing", async () => {
    gateway.refuse = { status: 502, detail: "cartesia did not say it: Not Found" };
    const err = written();
    let played = false;

    const code = await run(["play", "nobody"], { err: err.stream, env, play: () => ((played = true), "afplay") });

    expect(code).toBe(1);
    expect(err.text()).toContain("Not Found");
    expect(played).toBe(false);
  });
});

describe("reading Server-Timing", () => {
  it("finds each metric by name, and 0 for one the gateway did not send", () => {
    expect(aDuration("first-audio;dur=210, total;dur=900", "total")).toBe(900);
    expect(aDuration("first-audio;dur=210", "total")).toBe(0);
  });
});
