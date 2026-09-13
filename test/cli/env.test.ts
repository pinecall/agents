// Where the key comes from: the order, pinned. Every test hands doorFrom its own environment and
// its own ~/.pinecall, so nothing here reads the machine's and nothing here can be told by it.

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

import { writeGateway } from "../../src/cli/credentials.js";
import { DEFAULT_URL, doorFrom, noKey, theDoor } from "../../src/cli/env.js";
import { written } from "./said.js";

const LOCAL = "http://127.0.0.1:8080";
const A_DEV_KEY = "a-dev-key-nobody-will-ever-deploy";
const AN_ORG_KEY = "pk_the_orgs_own_key_nobody_will_deploy";

let home = "";

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "pinecall-home-"));
});

/** The file a local `pinecall-runtime gateway` on a dev key leaves behind. */
function aLocalGateway(): void {
  writeFileSync(join(home, "dev"), JSON.stringify({ url: LOCAL, key: A_DEV_KEY }), { mode: 0o600 });
}

/** doorFrom against this test's own home, whatever the machine running it has in its own. */
function door(env: NodeJS.ProcessEnv) {
  return doorFrom({ ...env, PINECALL_HOME: home });
}

describe("which gateway this terminal is pointed at", () => {
  it("is the local one when nothing at all is exported and nothing is running", () => {
    expect(door({}).url).toBe(DEFAULT_URL);
  });

  // The file a local gateway leaves is read as a profile called `local`, every time and written
  // never: it moves with whichever port that gateway opened on, and vanishes when it stops.
  it("is the running gateway's own, found without anybody exporting anything", () => {
    aLocalGateway();

    expect(door({})).toEqual({ url: LOCAL, apiKey: A_DEV_KEY, source: "profile" });
  });

  it("is the one gateway `pinecall login` kept, when there is exactly one and nothing runs here", () => {
    writeGateway("https://box.pinecall.io", { api_key: AN_ORG_KEY, org: "clinica" }, home);

    expect(door({})).toEqual({ url: "https://box.pinecall.io", apiKey: AN_ORG_KEY, source: "profile" });
  });

  it("is the default again when two gateways were logged in to: choosing is PINECALL_URL's job", () => {
    writeGateway("https://box.pinecall.io", { api_key: AN_ORG_KEY, org: "clinica" }, home);
    writeGateway("https://other.example", { api_key: AN_ORG_KEY, org: "tienda" }, home);

    expect(door({}).url).toBe(DEFAULT_URL);
  });

  it("is PINECALL_URL over everything, including a gateway running here", () => {
    aLocalGateway();

    expect(door({ PINECALL_URL: "https://box.pinecall.io" }).url).toBe("https://box.pinecall.io");
  });
});

describe("which key opens it", () => {
  // The footgun this whole file exists to retire: a gateway started on a dev key honours THAT key
  // and no other, so an org key exported in this shell is provably wrong there — and a bare 403
  // with no sentence in it has cost this project two afternoons.
  it("is the local gateway's own even when a real key is exported, and says so once", () => {
    aLocalGateway();

    const found = door({ PINECALL_API_KEY: AN_ORG_KEY });

    expect(found).toMatchObject({ apiKey: A_DEV_KEY, source: "dev-file" });
    expect(found.ignoring).toBe(`ignoring PINECALL_API_KEY: the local gateway at ${LOCAL} honours its dev key only`);
  });

  it("says nothing about a key nobody exported", () => {
    aLocalGateway();

    expect(door({}).ignoring).toBeUndefined();
  });

  it("is PINECALL_API_KEY for a gateway that is not the one running here", () => {
    aLocalGateway();

    const found = door({ PINECALL_URL: "https://box.pinecall.io", PINECALL_API_KEY: AN_ORG_KEY });

    expect(found).toEqual({ url: "https://box.pinecall.io", apiKey: AN_ORG_KEY, source: "env" });
  });

  it("is the key `pinecall login` kept for that gateway when this shell exports none", () => {
    writeGateway("https://box.pinecall.io", { api_key: AN_ORG_KEY, org: "clinica" }, home);

    const found = door({ PINECALL_URL: "https://box.pinecall.io/" });

    expect(found).toMatchObject({ apiKey: AN_ORG_KEY, source: "credentials" });
  });

  it("is a hand-exported dev key last, so a terminal that worked before still does", () => {
    expect(door({ PINECALL_DEV_KEY: A_DEV_KEY })).toEqual({
      url: DEFAULT_URL,
      apiKey: A_DEV_KEY,
      source: "dev-env",
    });
  });

  it("is nothing at all when this machine has been told nothing", () => {
    expect(door({})).toEqual({ url: DEFAULT_URL, apiKey: undefined, source: "none" });
  });
});

describe("what a verb does with it", () => {
  it("names the gateway and the verb that fixes it, rather than two environment names", () => {
    const said = written();

    expect(theDoor({ PINECALL_HOME: home }, said.stream)).toBeUndefined();
    expect(said.text()).toBe(`${noKey(DEFAULT_URL)}\n`);
    expect(said.text()).toContain("pinecall login http://localhost:8080");
  });

  it("says the one thing it is ignoring before it hands the door over", () => {
    aLocalGateway();
    const said = written();

    const open = theDoor({ PINECALL_HOME: home, PINECALL_API_KEY: AN_ORG_KEY }, said.stream);

    expect(open).toEqual({ url: LOCAL, apiKey: A_DEV_KEY, source: "dev-file" });
    expect(said.text()).toBe(`ignoring PINECALL_API_KEY: the local gateway at ${LOCAL} honours its dev key only\n`);
  });
});
