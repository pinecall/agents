// `pinecall personas`: the one list the gateway is asked for, the sentence every refusal ends in,
// what `--json` prints, and a migration that stops halfway saying exactly where it stopped.

import { mkdtempSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { asATable } from "../../src/cli/persona-lines.js";
import { run } from "../../src/cli/personas.js";
import { pointingAt } from "./home.js";
import { written } from "./said.js";

const A_KEY = "pk_the_orgs_own_key";
const AGENT = "clinica-norte";

/** A project whose agent is called `sales` and whose class is called `bidfire-sales`. */
const BIDFIRE = fileURLToPath(new URL("./bidfire", import.meta.url));

const APURADO = {
  name: "apurado",
  about: "",
  goal: "cambiar la cita al martes",
  style: "frases cortas, interrumpe",
  facts: { "su teléfono": "600 000 001" },
  state: {} as Record<string, unknown>,
  llm: null as string | null,
  tts: null as string | null,
  voice: null as string | null,
  accepts_when: "",
  declines_when: "",
  author: "m_ana",
  set_at: 1758300000,
};

/** One request as the gateway heard it: the method, the path, and the body it was sent. */
interface Heard {
  method: string;
  path: string;
  body: unknown;
}

/** A gateway with the three persona doors, keeping one roster for the org, as the real one does. */
class FakeGateway {
  readonly heard: Heard[] = [];
  personas: (typeof APURADO)[] = [];
  /** A caller this gateway will not take, whatever is sent for it: the refusal mid-migration. */
  refuses: string | undefined;
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

  /** Every path asked for, so a test reads that no agent was ever named in one. */
  get pathsAsked(): string[] {
    return [...new Set(this.heard.map((one) => one.path.split("?")[0] ?? ""))];
  }

  async #answer(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(chunk as Buffer);
    const text = Buffer.concat(chunks).toString("utf8");
    const heard: Heard = { method: request.method ?? "", path: request.url ?? "", body: text === "" ? null : JSON.parse(text) };
    this.heard.push(heard);
    const name = decodeURIComponent(heard.path.split("/").at(-1) ?? "");
    if (heard.method === "PUT") {
      if (name === this.refuses) return this.#said(response, 422, { detail: `no caller may be called ${name}` });
      const written_ = heard.body as { goal: string; style: string; was?: string };
      const before = this.personas.filter((one) => one.name !== name && one.name !== written_.was);
      this.personas = [...before, { ...APURADO, ...written_, name }];
    }
    if (heard.method === "DELETE") this.personas = this.personas.filter((one) => one.name !== name);
    this.#said(response, 200, { personas: this.personas });
  }

  #said(response: ServerResponse, status: number, body: unknown): void {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify(body));
  }
}

const gateway = new FakeGateway();
let env: NodeJS.ProcessEnv;

beforeEach(async () => {
  gateway.heard.length = 0;
  gateway.personas = [];
  gateway.refuses = undefined;
  await gateway.open();
  env = pointingAt(gateway.url, A_KEY);
});

afterEach(async () => {
  await gateway.close();
});

describe("whose callers", () => {
  // A caller is the ORG's: no agent in the path, and no class loaded to find a slug for one.
  // `--agent` used to decide the path, so `personas --agent sales` asked for the callers of
  // "sales" — a roster nobody had — while the console showed them under the class's slug. It
  // names no path now, and no verb that lists or writes takes it at all.
  it("asks for the org's one list from a project that holds several agents", async () => {
    const was = process.cwd();
    process.chdir(BIDFIRE);
    try {
      expect(await run(["list"], { out: written().stream, env })).toBe(0);
    } finally {
      process.chdir(was);
    }

    expect(gateway.pathsAsked).toEqual(["/v1/personas"]);
  });

  it("asks for the same list from a terminal that names no agent at all", async () => {
    expect(await run(["list"], { out: written().stream, env })).toBe(0);

    expect(gateway.pathsAsked).toEqual(["/v1/personas"]);
  });
});

describe("the verbs it answers to", () => {
  it("prints the usage for a word nobody wrote, and loads nothing to say so", async () => {
    const err = written();

    const code = await run(["fly", "--agent", AGENT], { out: written().stream, err: err.stream, env });

    expect(code).toBe(2);
    expect(err.text()).toContain("usage: pinecall personas");
    expect(gateway.heard).toEqual([]);
  });

  it("prints the usage when a verb that takes a name was given none", async () => {
    const err = written();

    expect(await run(["show", "--agent", AGENT], { out: written().stream, err: err.stream, env })).toBe(2);
    expect(err.text()).toContain("usage: pinecall personas");
  });

  it("says the org has none yet rather than printing an empty page", async () => {
    const out = written();

    expect(await run([], { out: out.stream, env })).toBe(0);
    expect(out.text()).toContain("this org has no personas yet");
  });

  it("writes one whole, and changes what is named on the one there", async () => {
    const out = written();

    expect(await run(["add", "apurado", "--goal", "cambiar la cita", "--style", "frases cortas"], { out: out.stream, env })).toBe(0);
    expect(out.text()).toBe("apurado written · 1 persona(s)\n");

    expect(await run(["edit", "apurado", "--style", "grita un poco"], { out: written().stream, env })).toBe(0);
    expect(gateway.personas[0]).toMatchObject({ goal: "cambiar la cita", style: "grita un poco" });
  });
});

describe("how a caller is played, and when it accepts the call", () => {
  it("sends the three knobs and the rule, with a tier expanded as agent set expands it", async () => {
    const argv = ["add", "apurado", "--goal", "g", "--style", "s", "--llm", "haiku", "--voice", "carolina"];
    expect(await run([...argv, "--accepts-when", "una hora hoy", "--declines-when", "le piden llamar"], { out: written().stream, env })).toBe(0);

    const [put] = gateway.heard.filter((one) => one.method === "PUT");
    expect(put?.body).toMatchObject({
      llm: "anthropic/claude-haiku-4-5-20251001",
      tts: null,
      voice: "carolina",
      accepts_when: "una hora hoy",
      declines_when: "le piden llamar",
    });
  });

  it("keeps what edit does not name, and clears what it names empty", async () => {
    gateway.personas = [{ ...APURADO, llm: "openai/gpt-5", voice: "carolina", accepts_when: "una hora" }];

    expect(await run(["edit", "apurado", "--voice", ""], { out: written().stream, env })).toBe(0);

    const [put] = gateway.heard.filter((one) => one.method === "PUT");
    expect(put?.body).toMatchObject({ llm: "openai/gpt-5", voice: "", accepts_when: "una hora" });
  });

  it("refuses a --llm that names no model, in agent set's own sentence, and sends nothing", async () => {
    const err = written();

    const code = await run(["add", "apurado", "--goal", "g", "--style", "s", "--llm", "vendor/"], { out: written().stream, err: err.stream, env });

    expect(code).toBe(2);
    expect(err.text()).toContain("--llm vendor/ names no model");
    expect(gateway.heard.filter((one) => one.method === "PUT")).toEqual([]);
  });

  it("is shown with whose choice each knob is, and whether any judge reads its calls", async () => {
    gateway.personas = [{ ...APURADO, llm: "openai/gpt-5", declines_when: "le piden llamar" }];
    const out = written();

    expect(await run(["show", "apurado"], { out: out.stream, env })).toBe(0);

    expect(out.text()).toContain("played by openai/gpt-5 · read by the runtime's · voice the runtime's");
    expect(out.text()).toContain("declines when: le piden llamar");
    expect(out.text()).not.toContain("accepts when");
  });
});

describe("a caller nobody wrote", () => {
  // Each of the three ends in the same sentence, and in a 2: the gateway's own 404 body is no
  // answer for a person, and `rm` used to print one and leave with a 1.
  it("is shown, dropped and tried with the same sentence and the same exit code", async () => {
    for (const argv of [["show", "fantasma"], ["rm", "fantasma"], ["edit", "fantasma", "--goal", "x"]]) {
      const err = written();

      const code = await run([...argv], { out: written().stream, err: err.stream, env });

      expect(code).toBe(2);
      expect(err.text()).toContain("no persona called fantasma");
    }
    expect(gateway.heard.filter((one) => one.method !== "GET")).toEqual([]);
  });

  it("is added under a name the gateway would refuse, and the name never travels", async () => {
    const err = written();

    const code = await run(["add", "Price Shopper", "--goal", "un precio", "--style", "seco"], {
      out: written().stream,
      err: err.stream,
      env,
    });

    expect(code).toBe(2);
    expect(err.text()).toContain("Price Shopper is no name for a caller");
    expect(err.text()).toContain("lower-case letters and digits joined by hyphens");
    expect(gateway.heard.filter((one) => one.method === "PUT")).toEqual([]);
  });

  it("refuses a --rename the gateway would refuse, on a caller that is there", async () => {
    gateway.personas = [APURADO];
    const err = written();

    const code = await run(["edit", "apurado", "--rename", "EL-APURADO"], { out: written().stream, err: err.stream, env });

    expect(code).toBe(2);
    expect(err.text()).toContain("EL-APURADO is no name for a caller");
  });

  it("is added twice, and told where to change the one there", async () => {
    gateway.personas = [APURADO];
    const err = written();

    const code = await run(["add", "apurado", "--goal", "otra cosa", "--style", "seco"], { out: written().stream, err: err.stream, env });

    expect(code).toBe(2);
    expect(err.text()).toContain("pinecall personas edit apurado");
  });

  it("is written with no goal and no style, which is not a caller at all", async () => {
    const err = written();

    const code = await run(["add", "seco", "--goal", "un precio"], { out: written().stream, err: err.stream, env });

    expect(code).toBe(2);
    expect(err.text()).toContain("a persona needs --goal and --style");
  });
});

describe("--json", () => {
  it("prints the caller for show and the roster for everything the gateway answered", async () => {
    gateway.personas = [APURADO];

    const shown = written();
    expect(await run(["show", "apurado", "--json"], { out: shown.stream, env })).toBe(0);
    expect(JSON.parse(shown.text())).toMatchObject({ name: "apurado", goal: "cambiar la cita al martes" });

    const listed = written();
    expect(await run(["list", "--json"], { out: listed.stream, env })).toBe(0);
    expect(JSON.parse(listed.text())).toEqual({ personas: [APURADO] });

    const dropped = written();
    expect(await run(["rm", "apurado", "--json"], { out: dropped.stream, env })).toBe(0);
    expect(JSON.parse(dropped.text())).toEqual({ personas: [] });
  });

  it("answers the roster after a write, and nothing else", async () => {
    const out = written();

    expect(await run(["add", "apurado", "--goal", "la cita", "--style", "seco", "--json"], { out: out.stream, env })).toBe(0);

    expect(JSON.parse(out.text())).toMatchObject({ personas: [{ name: "apurado", goal: "la cita" }] });
  });

  // `try` holds a live call and prints its turns as they land: there is no answer to print, so the
  // flag is refused before anything is loaded rather than quietly ignored.
  it("is refused by try, which prints a call and not an answer", async () => {
    const err = written();

    const code = await run(["try", "apurado", "--agent", AGENT, "--json"], { out: written().stream, err: err.stream, env });

    expect(code).toBe(2);
    expect(err.text()).toContain("drop --json");
    expect(gateway.heard).toEqual([]);
  });
});

describe("the migration", () => {
  /** A folder of personas as a project still keeps them: one file per caller. */
  function files(names: string[]): string {
    const folder = mkdtempSync(join(tmpdir(), "pinecall-personas-"));
    for (const name of names) {
      writeFileSync(join(folder, `${name}.ts`), `// A caller a project wrote as a file.\nexport default { goal: "algo", style: "seco" };\n`);
    }
    return folder;
  }

  it("sends every file once and says how many landed", async () => {
    const out = written();

    const code = await run(["push", "--from", files(["apurado", "desconfiado"]), "--agent", AGENT], { out: out.stream, env });

    expect(code).toBe(0);
    expect(gateway.personas.map((one) => one.name)).toEqual(["apurado", "desconfiado"]);
    expect(out.text()).toContain("2 persona(s) pushed");
  });

  it("says where it looked when the folder holds none, and sends nothing", async () => {
    const err = written();
    const folder = files([]);

    expect(await run(["push", "--from", folder, "--agent", AGENT], { out: written().stream, err: err.stream, env })).toBe(2);
    expect(err.text()).toBe(`no personas in ${folder}\n`);
    expect(gateway.heard).toEqual([]);
  });

  // A push that stops in the middle has written some callers and not others, and the files are all
  // still there: it used to leave with the gateway's JSON and a 1, saying nothing about either half.
  it("names what landed and what did not when one caller is refused halfway", async () => {
    gateway.refuses = "desconfiado";
    const err = written();

    const code = await run(["push", "--from", files(["apurado", "desconfiado", "resignado"]), "--agent", AGENT], {
      out: written().stream,
      err: err.stream,
      env,
    });

    expect(code).toBe(2);
    expect(err.text()).toContain("no caller may be called desconfiado");
    expect(err.text()).toContain("pushed: apurado");
    expect(err.text()).toContain("still only files: desconfiado, resignado");
    expect(gateway.personas.map((one) => one.name)).toEqual(["apurado"]);
  });
});

// `--agent` and `--file` name the CLASS, and only `try` and `push` have one to name. They used to
// be parsed and dropped on the other five, so `personas list --agent whoever` answered the whole
// org's roster with exit 0: a flag that looks like a filter and is not one (production, 2026-09-20).
describe("a flag that names the class", () => {
  it("is refused by a verb that has no class to name, before the gateway is asked", async () => {
    for (const argv of [
      ["list", "--agent", AGENT],
      ["show", "apurado", "--agent", AGENT],
      ["rm", "apurado", "--file", "agent.tsx"],
      ["edit", "apurado", "--agent", AGENT, "--style", "seco"],
    ]) {
      const err = written();

      expect(await run(argv, { out: written().stream, err: err.stream, env })).toBe(2);
      expect(err.text()).toContain("the two that need the class");
      expect(err.text()).toContain("a caller is the org's");
    }

    expect(gateway.heard).toEqual([]);
  });
});

// The columns were 12 and 46 wide whatever was in them, so `office-manager` (14 characters) slid
// its own row two to the right and the roster stopped lining up (production, 2026-09-20).
describe("the roster as a table", () => {
  it("is as wide as the widest name and the widest style, and never narrower", () => {
    const rows = asATable([
      { name: "homeowner", style: "friendly", goal: "a quote", about: "", facts: {} },
      { name: "office-manager", style: "direct, asks about insurance", goal: "a weekly clean", about: "", facts: {} },
    ] as never);

    const goals = rows.map((row) => row.indexOf("a quote") === -1 ? row.indexOf("a weekly clean") : row.indexOf("a quote"));
    expect(goals[0]).toBe(goals[1]);
    expect(rows[0]).toContain("homeowner       friendly");
  });
});
