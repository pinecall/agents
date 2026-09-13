// `pinecall pipeline`: the three legs read back, and the five knobs turned over a door that takes
// the whole set — so what this verb sends is what the next call is built with, and nothing else.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { run } from "../../src/cli/pipeline.js";
import { pointingAt } from "./home.js";
import { written } from "./said.js";

const A_KEY = "pk_the_orgs_key";
const AGENT = "clinica-norte";

/** What the pipeline door answers, with one knob already turned by somebody else. */
const REPORT = {
  agent: AGENT,
  hears: { vendor: "deepgram", model: "nova-3", voice_id: null, language: "es" },
  decides: { vendor: "anthropic", model: "claude-haiku-4-5", voice_id: null, language: null },
  speaks: { vendor: "elevenlabs", model: "eleven_flash_v2_5", voice_id: "Lucia", language: "es" },
  greeting: { say: "Clínica Norte, ¿en qué puedo ayudarle?", reply: null, allow_interruptions: null },
  overrides: { voice: "Lucia", tts_model: null, stt: null, llm: null, greeting: null },
  voices: ["Lucia", "Mateo"],
  calls: 12,
  medians: [{ name: "eou_delay", seconds: 0.31, turns: 40 }],
  unavailable_reasons: { cartesia: "no key on this box" },
};

/** One request as the gateway heard it. */
interface Heard {
  method: string;
  path: string;
  body: unknown;
}

/** A gateway with the agent's two pipeline doors, which answers the report to both. */
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

  /** The body of the last PUT: what this verb decided the whole set of knobs now is. */
  get turned(): Record<string, unknown> {
    const put = this.heard.filter((one) => one.method === "PUT").at(-1);
    return (put?.body ?? {}) as Record<string, unknown>;
  }

  async #answer(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(chunk as Buffer);
    const text = Buffer.concat(chunks).toString("utf8");
    this.heard.push({ method: request.method ?? "", path: request.url ?? "", body: text === "" ? null : JSON.parse(text) });
    if (this.refuse !== undefined && request.method === "PUT") {
      response.writeHead(this.refuse.status, { "content-type": "application/json" });
      response.end(JSON.stringify({ detail: this.refuse.detail }));
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(REPORT));
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

function environment(): NodeJS.ProcessEnv {
  return pointingAt(gateway.url, A_KEY);
}

describe("what the agent runs on", () => {
  it("prints the three legs, the opening, the medians and what somebody turned", async () => {
    const out = written();

    const code = await run(["--agent", AGENT], { out: out.stream, env: environment() });

    expect(code).toBe(0);
    expect(out.text()).toContain("deepgram · nova-3 · es");
    expect(out.text()).toContain("anthropic · claude-haiku-4-5");
    expect(out.text()).toContain("elevenlabs · eleven_flash_v2_5 · Lucia · es   ← turned: voice");
    expect(out.text()).toContain("Clínica Norte");
    expect(out.text()).toContain("eou_delay 0.31s");
    expect(out.text()).toContain("cartesia is not available here: no key on this box");
  });

  it("answers the door's own JSON when asked for it", async () => {
    const out = written();

    await run(["--agent", AGENT, "--json"], { out: out.stream, env: environment() });

    expect(JSON.parse(out.text())).toMatchObject({ agent: AGENT });
  });
});

describe("turning a knob", () => {
  // The door replaces the whole set, so a `set` that names one knob must carry back every knob
  // that was already turned: otherwise turning the llm tonight gives the voice back to the class.
  it("sends the whole set: what was turned before, and what this command line named", async () => {
    const out = written();

    const code = await run(["set", "--agent", AGENT, "--llm", "anthropic/claude-haiku-4-5"], {
      out: out.stream,
      env: environment(),
    });

    expect(code).toBe(0);
    expect(gateway.turned).toEqual({ voice: "Lucia", llm: "anthropic/claude-haiku-4-5" });
  });

  it("gives one knob back and keeps the rest", async () => {
    const out = written();

    await run(["clear", "voice", "--agent", AGENT], { out: out.stream, env: environment() });

    expect(gateway.turned).toEqual({});
  });

  it("gives every knob back when nobody names one, without reading the door first", async () => {
    const out = written();

    await run(["clear", "--agent", AGENT], { out: out.stream, env: environment() });

    expect(gateway.turned).toEqual({});
    expect(gateway.heard.filter((one) => one.method === "GET")).toHaveLength(0);
  });

  it("refuses a knob nobody has, and names the five", async () => {
    const out = written();
    const err = written();

    const code = await run(["clear", "temperature", "--agent", AGENT], {
      out: out.stream,
      err: err.stream,
      env: environment(),
    });

    expect(code).toBe(1);
    expect(err.text()).toContain("no knob called temperature");
    expect(err.text()).toContain("tts-model");
  });

  it("says the gateway's own sentence when the door refuses the set", async () => {
    gateway.refuse = { status: 400, detail: "no tts vendor named 'acme'; this build has elevenlabs" };
    const err = written();

    const code = await run(["set", "--agent", AGENT, "--voice", "acme"], {
      out: written().stream,
      err: err.stream,
      env: environment(),
    });

    expect(code).toBe(1);
    expect(err.text()).toContain("no tts vendor named 'acme'");
  });
});
