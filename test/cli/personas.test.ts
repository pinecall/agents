// `pinecall personas`: whose callers the gateway is asked for, the sentence every refusal ends in,
// what `--json` prints, and a migration that stops halfway saying exactly where it stopped.

import { mkdtempSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

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
  state: {},
  author: "m_ana",
  set_at: 1758300000,
};

/** One request as the gateway heard it: the method, the path, and the body it was sent. */
interface Heard {
  method: string;
  path: string;
  body: unknown;
}

/** A gateway with the three persona doors, keeping one roster per agent, as the real one does. */
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

  /** The agent every request named, so a test reads the slug the verb decided on. */
  get agentsAsked(): string[] {
    return [...new Set(this.heard.map((one) => decodeURIComponent(one.path.split("/")[3] ?? "")))];
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
  // The gateway files them under the agent's SLUG, which is the class's own name and not the
  // folder's: `--agent sales` asked for the callers of "sales", and nobody has any.
  it("resolves an agent of this project by its name, and asks for the class's slug", async () => {
    const was = process.cwd();
    process.chdir(BIDFIRE);
    try {
      expect(await run(["list", "--agent", "sales"], { out: written().stream, env })).toBe(0);
    } finally {
      process.chdir(was);
    }

    expect(gateway.agentsAsked).toEqual(["bidfire-sales"]);
  });

  // A terminal outside the project still reaches its org's agents: what is not a name here is a
  // slug already, and no class is loaded to find that out.
  it("sends a slug of the org as it was typed", async () => {
    expect(await run(["list", "--agent", AGENT], { out: written().stream, env })).toBe(0);

    expect(gateway.agentsAsked).toEqual([AGENT]);
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

  it("says the agent has none yet rather than printing an empty page", async () => {
    const out = written();

    expect(await run(["--agent", AGENT], { out: out.stream, env })).toBe(0);
    expect(out.text()).toContain("clinica-norte has no personas yet");
  });

  it("writes one whole, and changes what is named on the one there", async () => {
    const out = written();

    expect(await run(["add", "apurado", "--goal", "cambiar la cita", "--style", "frases cortas", "--agent", AGENT], { out: out.stream, env })).toBe(0);
    expect(out.text()).toBe("clinica-norte · apurado written · 1 persona(s)\n");

    expect(await run(["edit", "apurado", "--style", "grita un poco", "--agent", AGENT], { out: written().stream, env })).toBe(0);
    expect(gateway.personas[0]).toMatchObject({ goal: "cambiar la cita", style: "grita un poco" });
  });
});

describe("a caller nobody wrote", () => {
  // Each of the three ends in the same sentence, and in a 2: the gateway's own 404 body is no
  // answer for a person, and `rm` used to print one and leave with a 1.
  it("is shown, dropped and tried with the same sentence and the same exit code", async () => {
    for (const argv of [["show", "fantasma"], ["rm", "fantasma"], ["edit", "fantasma", "--goal", "x"]]) {
      const err = written();

      const code = await run([...argv, "--agent", AGENT], { out: written().stream, err: err.stream, env });

      expect(code).toBe(2);
      expect(err.text()).toContain("no persona called fantasma for clinica-norte");
    }
    expect(gateway.heard.filter((one) => one.method !== "GET")).toEqual([]);
  });

  it("is added under a name the gateway would refuse, and the name never travels", async () => {
    const err = written();

    const code = await run(["add", "Price Shopper", "--goal", "un precio", "--style", "seco", "--agent", AGENT], {
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

    const code = await run(["edit", "apurado", "--rename", "EL-APURADO", "--agent", AGENT], { out: written().stream, err: err.stream, env });

    expect(code).toBe(2);
    expect(err.text()).toContain("EL-APURADO is no name for a caller");
  });

  it("is added twice, and told where to change the one there", async () => {
    gateway.personas = [APURADO];
    const err = written();

    const code = await run(["add", "apurado", "--goal", "otra cosa", "--style", "seco", "--agent", AGENT], { out: written().stream, err: err.stream, env });

    expect(code).toBe(2);
    expect(err.text()).toContain("pinecall personas edit apurado");
  });

  it("is written with no goal and no style, which is not a caller at all", async () => {
    const err = written();

    const code = await run(["add", "seco", "--goal", "un precio", "--agent", AGENT], { out: written().stream, err: err.stream, env });

    expect(code).toBe(2);
    expect(err.text()).toContain("a persona needs --goal and --style");
  });
});

describe("--json", () => {
  it("prints the caller for show and the roster for everything the gateway answered", async () => {
    gateway.personas = [APURADO];

    const shown = written();
    expect(await run(["show", "apurado", "--agent", AGENT, "--json"], { out: shown.stream, env })).toBe(0);
    expect(JSON.parse(shown.text())).toMatchObject({ name: "apurado", goal: "cambiar la cita al martes" });

    const listed = written();
    expect(await run(["list", "--agent", AGENT, "--json"], { out: listed.stream, env })).toBe(0);
    expect(JSON.parse(listed.text())).toEqual({ personas: [APURADO] });

    const dropped = written();
    expect(await run(["rm", "apurado", "--agent", AGENT, "--json"], { out: dropped.stream, env })).toBe(0);
    expect(JSON.parse(dropped.text())).toEqual({ personas: [] });
  });

  it("answers the roster after a write, and nothing else", async () => {
    const out = written();

    expect(await run(["add", "apurado", "--goal", "la cita", "--style", "seco", "--agent", AGENT, "--json"], { out: out.stream, env })).toBe(0);

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
    expect(out.text()).toContain("clinica-norte · 2 persona(s) pushed");
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
