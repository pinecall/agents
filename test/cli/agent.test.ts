// `pinecall agent`: the three corners on one page, a set that carries the corner's row and its
// version, the fields cleared, the history read, and a promote that carries the goldens.

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { linesOf } from "../../src/cli/agent-lines.js";
import { changes } from "../../src/cli/agent-versions.js";
import { run } from "../../src/cli/agent.js";
import { pointingAt } from "./home.js";
import { written } from "./said.js";

const A_KEY = "pk_the_orgs_key";
const AGENT = "clinica-norte";

const TEAM = {
  holder: "",
  version: 11,
  author: "m_bruno",
  note: "cleaner on the phone",
  set_at: 1758300000,
  config: { voice: "carolina", llm: "anthropic/claude-haiku-4-5", greeting: { say: "Clínica Norte, buenas." }, memory: { remember: ["allergies"], forget: [] } },
};
const YOURS = { holder: "m_ana", version: 3, author: "m_ana", note: null, set_at: 1758310000, config: { voice: "amelia" } };

/** One request as the gateway heard it. */
interface Heard {
  method: string;
  path: string;
  body: unknown;
}

/** A gateway with the settings doors: it answers the three corners and records every write. */
class FakeGateway {
  readonly heard: Heard[] = [];
  yours: typeof YOURS | null = YOURS;
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

  get written(): Record<string, unknown> {
    const put = this.heard.filter((one) => one.method === "PUT" || one.method === "POST").at(-1);
    return (put?.body ?? {}) as Record<string, unknown>;
  }

  async #answer(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(chunk as Buffer);
    const text = Buffer.concat(chunks).toString("utf8");
    const heard: Heard = { method: request.method ?? "", path: request.url ?? "", body: text === "" ? null : JSON.parse(text) };
    this.heard.push(heard);
    const answer = (status: number, body: unknown): void => {
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify(body));
    };
    if (this.refuse !== undefined && heard.method !== "GET") return answer(this.refuse.status, { detail: this.refuse.detail });
    if (heard.path.endsWith("/history?team=true")) return answer(200, { world: "sandbox", holder: "", rows: [TEAM, { ...TEAM, version: 10, note: null, config: { voice: "carolina" } }] });
    if (heard.path.includes("/diff")) return answer(200, { ours: YOURS, theirs: TEAM, changed: ["voice", "llm"] });
    if (heard.path.endsWith("/promote")) return answer(200, { world: (heard.body as { to: string }).to === "team" ? "sandbox" : "production", holder: "", version: 12, run: (heard.body as { to: string }).to === "team" ? null : "run_abc123" });
    return answer(200, { world: "sandbox", yours: this.yours, team: TEAM, production: null });
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

describe("the page", () => {
  it("draws the three corners, a row per field, and which version each is at", () => {
    const lines = linesOf(AGENT, { world: "sandbox", yours: YOURS, team: TEAM, production: null });

    expect(lines[0]).toBe("clinica-norte · sandbox");
    expect(lines.find((line) => line.startsWith("  voice"))).toMatch(/voice\s+amelia\s+carolina\s+—/);
    expect(lines.find((line) => line.startsWith("  greeting"))).toContain('"Clínica Norte, buenas."');
    expect(lines.find((line) => line.startsWith("  memory"))).toContain("remember 1 · forget 0");
    expect(lines.at(-1)).toContain("yours: v3 · m_ana");
    expect(lines.at(-1)).toContain('team: v11 · m_bruno · ');
    expect(lines.at(-1)).toContain("production: nothing set");
  });

  it("reads your column as the team's when you set nothing", () => {
    const lines = linesOf(AGENT, { world: "sandbox", yours: null, team: TEAM, production: null });

    expect(lines.find((line) => line.startsWith("  voice"))).toMatch(/voice\s+\(team's\)\s+carolina/);
  });

  it("prints it, and the door's own JSON when asked", async () => {
    const out = written();

    expect(await run(["--agent", AGENT], { out: out.stream, env: environment() })).toBe(0);
    expect(out.text()).toContain("clinica-norte · sandbox");

    const json = written();
    await run(["--agent", AGENT, "--json"], { out: json.stream, env: environment() });
    expect(JSON.parse(json.text())).toMatchObject({ world: "sandbox" });
  });
});

describe("setting", () => {
  // The door takes the whole set with the version it was read at, so what this command line did
  // not name is carried over from the corner's own row: `set --llm x` keeps the voice.
  it("sends the corner's whole row with the version read, and what was typed over it", async () => {
    await run(["set", "--agent", AGENT, "--llm", "anthropic/claude-sonnet-4-5", "--note", "faster"], { out: written().stream, env: environment() });

    expect(gateway.written).toEqual({
      config: { voice: "amelia", llm: "anthropic/claude-sonnet-4-5" },
      if_version: 3,
      note: "faster",
      team: false,
    });
  });

  it("writes the team's corner with --team, over the team's own row", async () => {
    await run(["set", "--agent", AGENT, "--team", "--greeting", "Buenas."], { out: written().stream, env: environment() });

    const body = gateway.written as { config: Record<string, unknown>; if_version: number; team: boolean };
    expect(body.team).toBe(true);
    expect(body.if_version).toBe(11);
    expect(body.config["greeting"]).toEqual({ say: "Buenas." });
    expect(body.config["llm"]).toBe("anthropic/claude-haiku-4-5");
  });

  it("starts a corner of your own from nothing, with no version to check", async () => {
    gateway.yours = null;

    await run(["set", "--agent", AGENT, "--voice", "mateo", "--endpointing-ms", "300"], { out: written().stream, env: environment() });

    expect(gateway.written).toEqual({ config: { voice: "mateo", turn: { endpointing_ms: 300 } }, if_version: null, note: null, team: false });
  });

  it("replaces the memory lists whole", async () => {
    await run(["set", "--agent", AGENT, "--team", "--remember", "pets", "--remember", "the address"], { out: written().stream, env: environment() });

    expect((gateway.written as { config: { memory: unknown } }).config.memory).toEqual({ remember: ["pets", "the address"], forget: [] });
  });

  it("clears named fields and keeps the rest; with none, everything", async () => {
    await run(["clear", "voice", "--agent", AGENT, "--team"], { out: written().stream, env: environment() });
    expect((gateway.written as { config: Record<string, unknown> }).config).toEqual({ llm: "anthropic/claude-haiku-4-5", greeting: { say: "Clínica Norte, buenas." }, memory: { remember: ["allergies"], forget: [] } });

    await run(["clear", "--agent", AGENT], { out: written().stream, env: environment() });
    expect(gateway.written).toMatchObject({ config: {}, if_version: 3 });
  });

  it("refuses a field nobody has, naming the ten", async () => {
    const err = written();

    const code = await run(["clear", "temperature", "--agent", AGENT], { out: written().stream, err: err.stream, env: environment() });

    expect(code).toBe(1);
    expect(err.text()).toContain("no field called temperature");
    expect(err.text()).toContain("tts-model");
  });

  it("says the gateway's own sentence when the corner moved", async () => {
    gateway.refuse = { status: 409, detail: "this corner is at v4 now, not the version you read: read it again, then set again" };
    const err = written();

    const code = await run(["set", "--agent", AGENT, "--voice", "sofia"], { out: written().stream, err: err.stream, env: environment() });

    expect(code).toBe(1);
    expect(err.text()).toContain("this corner is at v4 now");
  });
});

describe("the versions", () => {
  it("prints a history as what each version changed", async () => {
    const out = written();

    await run(["history", "--agent", AGENT, "--team"], { out: out.stream, env: environment() });

    expect(out.text()).toContain("the org's own corner");
    expect(out.text()).toContain("v11 · m_bruno");
    expect(out.text()).toContain("llm — → anthropic/claude-haiku-4-5");
    expect(out.text()).toContain("v10 · m_bruno");
  });

  it("says what changes between two configs, field by field", () => {
    expect(changes({ voice: "carolina" }, { voice: "amelia", turn: { endpointing_ms: 300 } }, "")).toBe("voice carolina → amelia · turn — → endpointing 300 ms");
    expect(changes({}, {}, "  ")).toBe("");
  });

  it("promotes to the team with no goldens, and to production with the ones beside the agent", async () => {
    await run(["promote", "--agent", AGENT], { out: written().stream, env: environment() });
    expect(gateway.written).toEqual({ to: "team", note: null });

    const root = mkdtempSync(join(tmpdir(), "pinecall-agent-"));
    mkdirSync(join(root, "test", "goldens"), { recursive: true });
    writeFileSync(join(root, "test", "goldens", "greets.json"), JSON.stringify({ input: ["hola"], expect: { says: ["Clínica"] } }));
    writeFileSync(join(root, "agent.tsx"), "export default class X {}");
    const out = written();
    const code = await run(["promote", "--agent", AGENT, "--to", "production", "--file", join(root, "agent.tsx")], { out: out.stream, env: environment() });

    expect(code).toBe(0);
    const sent = gateway.written as { to: string; goldens: { name: string }[] };
    expect(sent.to).toBe("production");
    expect(sent.goldens.map((one) => one.name)).toEqual(["greets"]);
    expect(out.text()).toContain("production v12 · every golden held · eval run run_abc123");
  });

  it("rolls one version back as the next one", async () => {
    await run(["rollback", "10", "--agent", AGENT, "--team"], { out: written().stream, env: environment() });

    expect(gateway.written).toEqual({ version: 10, team: true });
  });
});
