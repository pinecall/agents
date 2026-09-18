// One file, one name, and no order to remember: which gateway and which key, settled by the
// profile a person chose out loud. Every test has its own ~/.pinecall and reads nobody's machine.

import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

import { run, use } from "../../src/cli/config.js";
import { writeGateway } from "../../src/cli/credentials.js";
import { doorFrom } from "../../src/cli/env.js";
import { activate, chooseGateway, nameFor, profileFor, readConfig, writeProfile } from "../../src/cli/profiles.js";
import { written } from "./said.js";

const BOX = "https://box.pinecall.io";
const OTHER = "https://stg.pinecall.io";
const LOCAL = "http://127.0.0.1:8080";
const A_KEY = "pk_nobody_will_ever_deploy_this";
const ANOTHER = "pk_the_other_gateways_key";
const A_DEV_KEY = "a-dev-key-nobody-will-ever-deploy";

let home = "";

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "pinecall-home-"));
});

describe("naming a gateway", () => {
  it("takes the host's first label, and calls a loopback `local`", () => {
    const empty = { profiles: {} };
    expect(nameFor(BOX, empty)).toBe("box");
    expect(nameFor(LOCAL, empty)).toBe("local");
    expect(nameFor("https://gateway.acme.example", empty)).toBe("gateway");
  });

  // Silently repointing a name is how somebody deploys to the wrong box.
  it("numbers a name another gateway already answers to, and reuses it for the same one", () => {
    const config = { profiles: { box: { url: BOX, key: A_KEY } } };
    expect(nameFor("https://box.otherthing.example", config)).toBe("box-2");
    expect(nameFor(BOX, config)).toBe("box");
  });
});

describe("the file", () => {
  it("keeps a profile, makes it active, and is readable by nobody else", () => {
    writeProfile("box", { url: BOX, key: A_KEY, org: "clinica" }, home);

    const config = readConfig(home);
    expect(config.active).toBe("box");
    expect(config.profiles["box"]).toEqual({ url: BOX, key: A_KEY, org: "clinica" });
    expect(statSync(join(home, "config.json")).mode & 0o077).toBe(0);
  });

  it("moves the active one and answers nothing for a name nobody kept", () => {
    writeProfile("box", { url: BOX, key: A_KEY }, home);
    writeProfile("stg", { url: OTHER, key: ANOTHER }, home);

    expect(activate("box", home)).toBe(true);
    expect(profileFor(undefined, home)?.url).toBe(BOX);
    expect(profileFor("stg", home)?.url).toBe(OTHER);
    expect(activate("nobody", home)).toBe(false);
    expect(profileFor("nobody", home)).toBeUndefined();
  });

  // v1's CLI on this same machine still reads `credentials`, so it is folded in and left alone.
  it("folds the old credentials file in once and writes them down", () => {
    writeGateway(BOX, { api_key: A_KEY, org: "clinica" }, home);

    const config = readConfig(home);

    expect(config.profiles["box"]).toMatchObject({ url: BOX, key: A_KEY, org: "clinica" });
    expect(config.active).toBe("box");
    expect(JSON.parse(readFileSync(join(home, "config.json"), "utf8"))["profiles"]).toHaveProperty("box");
    expect(readFileSync(join(home, "credentials"), "utf8")).toContain(A_KEY);
  });

  // A gateway on a PINECALL_DEV_KEY used to write ~/.pinecall/dev at every start, and this file
  // folded it in as a profile nobody had kept. Both are gone with the dev key: a local gateway
  // runs on the same Postgres and the same issued keys a box does, so it is `pinecall login`
  // like any other, and a file left over from that runtime says nothing about this one.
  it("reads no gateway out of a file nobody logged in to", () => {
    writeFileSync(join(home, "dev"), JSON.stringify({ url: LOCAL, key: A_DEV_KEY }), { mode: 0o600 });

    expect(readConfig(home).profiles).toEqual({});
  });
});

describe("which door a verb goes to", () => {
  it("is the active profile, with nothing exported anywhere", () => {
    writeProfile("box", { url: BOX, key: A_KEY }, home);

    expect(doorFrom({ PINECALL_HOME: home })).toEqual({ url: BOX, apiKey: A_KEY, source: "profile" });
  });

  it("is the one `--profile` names, for this one command, whatever is active", () => {
    writeProfile("box", { url: BOX, key: A_KEY }, home);
    writeProfile("stg", { url: OTHER, key: ANOTHER }, home);
    activate("box", home);

    expect(doorFrom({ PINECALL_HOME: home }, home, "stg")).toMatchObject({ url: OTHER, apiKey: ANOTHER });
  });
});

describe("`pinecall config` and `pinecall use`", () => {
  it("prints the gateways with a mark on the one in hand, and no key", async () => {
    writeProfile("box", { url: BOX, key: A_KEY, org: "clinica", env: "sandbox" }, home);
    writeProfile("stg", { url: OTHER, key: ANOTHER, org: "clinica" }, home);
    activate("box", home);
    const out = written();

    expect(await run([], { out: out.stream, home })).toBe(0);

    expect(out.text()).toContain("▸ box");
    expect(out.text()).toContain("clinica · sandbox");
    expect(out.text()).not.toContain(A_KEY);
    expect(out.text()).not.toContain(ANOTHER);
  });

  // A profile is a key in a file, and there was no way to take one out: a gateway that moved and a
  // key that was revoked both stayed on the list, and a key that opens nothing is worse than none.
  it("forgets one, and takes the active mark with it rather than leaving it dangling", async () => {
    writeProfile("box", { url: BOX, key: A_KEY }, home);
    writeProfile("stg", { url: OTHER, key: ANOTHER }, home);
    activate("stg", home);
    const out = written();

    expect(await run(["rm", "stg"], { out: out.stream, home })).toBe(0);

    expect(out.text()).toBe("forgot stg\n");
    expect(Object.keys(readConfig(home).profiles)).toEqual(["box"]);
    expect(readConfig(home).active).toBeUndefined();
  });

  it("leaves the mark alone when the row it names is not the one going", async () => {
    writeProfile("box", { url: BOX, key: A_KEY }, home);
    writeProfile("stg", { url: OTHER, key: ANOTHER }, home);
    activate("box", home);

    expect(await run(["rm", "stg"], { out: written().stream, home })).toBe(0);
    expect(readConfig(home).active).toBe("box");
  });

  // `rm` rewrote the file from the two fields it knew, and the gateway this machine was pointed at
  // went with the row: forgetting a stale profile sent every later verb back to the cloud.
  it("leaves the gateway this machine is pointed at where it was", async () => {
    chooseGateway(OTHER, home);
    writeProfile("box", { url: BOX, key: A_KEY }, home);
    writeProfile("stg", { url: OTHER, key: ANOTHER }, home);

    expect(await run(["rm", "stg"], { out: written().stream, home })).toBe(0);
    expect(readConfig(home).gateway).toBe(OTHER);
  });

  it("names the ones there are when asked to forget a word that is not one", async () => {
    writeProfile("box", { url: BOX, key: A_KEY }, home);
    const err = written();

    expect(await run(["rm", "nope"], { err: err.stream, home })).toBe(2);
    expect(err.text()).toBe("no profile called nope: box\n");
  });

  it("says what to type when this machine knows no gateway at all", async () => {
    const out = written();

    await run([], { out: out.stream, home });

    expect(out.text()).toBe("no gateway yet: `pinecall login`\n");
  });

  it("moves the mark, and names the ones there are when the word is not one", async () => {
    writeProfile("box", { url: BOX, key: A_KEY }, home);
    writeProfile("stg", { url: OTHER, key: ANOTHER }, home);
    const out = written();
    const err = written();

    expect(await use(["box"], { out: out.stream, home })).toBe(0);
    expect(readConfig(home).active).toBe("box");

    expect(await use(["nope"], { err: err.stream, home })).toBe(2);
    expect(err.text()).toContain("no profile called nope: box · stg");
  });
});
