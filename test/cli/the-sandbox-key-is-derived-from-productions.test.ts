// The sandbox is an instance of its own, and a person holds a key of production's: a verb in the
// sandbox finds it where production says it is, and knocks with a key minted THERE from a code
// production's key asked for — kept in session.json, minted again once when refused, never for a
// server's token. Every request says which world it believes it is talking to.

import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { doorIn, doorLine, theDoor, type Open } from "../../src/cli/env.js";
import { saysNoWorld } from "../../src/cli/elsewhere.js";
import { keepSandbox, readSession } from "../../src/cli/signed-in.js";
import { run as whoami } from "../../src/cli/whoami.js";
import { inTheWorld } from "../../src/cli/world.js";
import { written } from "./said.js";
import { PRODUCTIONS_KEY, TwoInstances } from "./two-instances.js";

let instances = new TwoInstances();
let home = "";

beforeEach(async () => {
  instances = new TwoInstances();
  home = mkdtempSync(join(tmpdir(), "pinecall-home-"));
  await instances.open();
});

afterEach(async () => {
  await instances.close();
});

function environment(key: string = PRODUCTIONS_KEY): NodeJS.ProcessEnv {
  return { PINECALL_KEY: key, PINECALL_URL: instances.production, PINECALL_HOME: home };
}

async function aSandboxVerb(err: NodeJS.WritableStream = written().stream): Promise<Open | undefined> {
  return await theDoor(environment(), err, home);
}

describe("a verb in the sandbox", () => {
  it("knocks where production says its sandbox is, with a key the sandbox minted from production's code", async () => {
    const door = await aSandboxVerb();

    expect(door).toEqual({
      url: instances.sandbox,
      apiKey: "pc_the_sandboxs_key_2",
      source: "session.json, minted from the environment's",
      world: "sandbox",
    });
    const [code, login] = instances.signed();
    expect(code).toMatchObject({ at: "production", method: "POST", path: "/v1/login/codes", bearer: PRODUCTIONS_KEY });
    expect(login).toMatchObject({ at: "sandbox", method: "POST", path: "/v1/login", bearer: undefined });
    expect(login?.body).toEqual({ code: "lc_1", device: expect.any(String) });
  });

  it("keeps the key under the sandbox's URL, by production's key and never with it, and where the sandbox is", async () => {
    await aSandboxVerb();

    const session = readSession(home);
    expect(Object.values(session.gateways[instances.sandbox]?.minted ?? {})).toEqual(["pc_the_sandboxs_key_2"]);
    expect(session.gateways[instances.production]?.elsewhere?.url).toBe(instances.sandbox);
    expect(readFileSync(join(home, "session.json"), "utf8")).not.toContain(PRODUCTIONS_KEY);
  });

  it("uses the kept key on the next verb, and asks production for nothing", async () => {
    await aSandboxVerb();
    instances.heard.length = 0;

    expect((await aSandboxVerb())?.apiKey).toBe("pc_the_sandboxs_key_2");
    expect(instances.heard.map((knock) => `${knock.at} ${knock.path}`)).toEqual(["sandbox /v1/whoami"]);
  });

  it("mints again, once, when the sandbox no longer takes the kept key", async () => {
    await aSandboxVerb();
    instances.taken.clear();

    expect((await aSandboxVerb())?.apiKey).toBe("pc_the_sandboxs_key_4");
    expect(Object.values(readSession(home).gateways[instances.sandbox]?.minted ?? {})).toEqual(["pc_the_sandboxs_key_4"]);
  });

  it("says the sandbox's refusal when a fresh code is refused too, and keeps nothing", async () => {
    await aSandboxVerb();
    instances.taken.clear();
    instances.refusesCodes = true;
    const err = written();

    expect(await aSandboxVerb(err.stream)).toBeUndefined();
    expect(err.text()).toBe("the gateway answered 401: no code answers to that\n");
    expect(readSession(home).gateways[instances.sandbox]?.minted).toEqual({});
  });

  it("names the world it believes it is talking to on every request, at both instances", async () => {
    await aSandboxVerb();
    instances.taken.clear();
    await aSandboxVerb();
    await inTheWorld("production", async () => await theDoor(environment(), written().stream, home));
    await whoami([], written().stream, written().stream, environment());

    expect(instances.signed().length).toBeGreaterThan(4);
    for (const knock of instances.signed()) expect(`${knock.at} ${knock.path} ${knock.world}`).toBe(`${knock.at} ${knock.path} ${knock.at}`);
  });
});

describe("where the sandbox is", () => {
  it("is asked of production again once what was kept is a day old", async () => {
    keepSandbox(instances.production, { url: "http://127.0.0.1:1", read_at: Date.now() - 25 * 60 * 60 * 1000 }, home);

    expect((await aSandboxVerb())?.url).toBe(instances.sandbox);
  });

  it("is asked of production again when the one kept does not answer", async () => {
    keepSandbox(instances.production, { url: "http://127.0.0.1:1", read_at: Date.now() }, home);

    expect((await aSandboxVerb())?.url).toBe(instances.sandbox);
    expect(readSession(home).gateways[instances.production]?.elsewhere?.url).toBe(instances.sandbox);
  });

  // A laptop's own gateway, a box of one: everything happens there, as it did before the sandbox
  // was an instance, and the door line says why a verb that named no world is in production.
  it("is production itself on a gateway of one instance, and the door says so", async () => {
    instances.names = "no sandbox";

    const door = await aSandboxVerb();

    expect(door).toMatchObject({ url: instances.production, apiKey: PRODUCTIONS_KEY, world: "production", theOnlyInstance: true });
    expect(doorLine(door!)).toBe(`gateway ${instances.production} · key from the environment · production (the only instance)`);
    expect(instances.signed()).toEqual([]);
  });

  it("is the sandbox on a gateway of two, and never production", async () => {
    const door = await aSandboxVerb();

    expect(door).toMatchObject({ url: instances.sandbox, world: "sandbox" });
    expect(door?.theOnlyInstance).toBeUndefined();
  });

  it("is never guessed at a gateway that names no world: it is older than this CLI", async () => {
    instances.names = "no world";
    const err = written();

    expect(await aSandboxVerb(err.stream)).toBeUndefined();
    expect(err.text()).toBe(`${saysNoWorld(instances.production)}\n`);
  });
});

describe("a server's token", () => {
  it("is never the root of a derived key: it knocks at the instance it was made on, and nowhere else", async () => {
    const door = await doorIn("sandbox", { url: instances.sandbox, apiKey: "pc_test_the_ci_token", source: "the environment", world: "production" }, home);

    expect(door).toMatchObject({ url: instances.sandbox, apiKey: "pc_test_the_ci_token", world: "sandbox" });
    expect(instances.heard).toEqual([]);
    expect(readSession(home).gateways).toEqual({});
  });
});

describe("whoami", () => {
  it("prints one door on a gateway of one instance, saying it is the only one", async () => {
    instances.names = "no sandbox";
    const out = written();

    expect(await whoami([], out.stream, written().stream, environment())).toBe(0);

    expect(out.text()).toBe(
      `gateway ${instances.production} · key from the environment · production (the only instance)\n`
        + "  org clinica · key k_laptop · production · the laptop · production: yes\n",
    );
  });

  it("prints both doors: production's with the project's key, the sandbox's with the one minted there", async () => {
    const out = written();

    expect(await whoami([], out.stream, written().stream, environment())).toBe(0);

    expect(out.text()).toBe(
      `gateway ${instances.production} · key from the environment · production\n`
        + "  org clinica · key k_laptop · production · the laptop · production: yes\n"
        + `gateway ${instances.sandbox} · key from session.json, minted from the environment's · sandbox\n`
        + "  org clinica · key k_sandbox · sandbox · the laptop · production: yes\n",
    );
  });
});
