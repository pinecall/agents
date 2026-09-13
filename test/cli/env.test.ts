// Which gateway and which key: one profile, and there is nothing else. The order this file used
// to pin — four files and three variables, with the one you had not chosen winning — is gone, and
// what replaced it is tested where it lives, in profiles.test.ts. What is left here is the door a
// verb is handed, and the sentence it gets instead when this machine knows no gateway at all.

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_URL, doorFrom, doorLine, noKey, theDoor } from "../../src/cli/env.js";
import { writeProfile } from "../../src/cli/profiles.js";
import { written } from "./said.js";

const BOX = "https://box.pinecall.io";
const A_KEY = "pk_the_orgs_own_key_nobody_will_deploy";

let home = "";

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "pinecall-home-"));
});

describe("the door a verb is handed", () => {
  it("is the active profile, and says so", () => {
    writeProfile("box", { url: BOX, key: A_KEY }, home);

    expect(doorFrom({ PINECALL_HOME: home })).toEqual({ url: BOX, apiKey: A_KEY, source: "profile" });
  });

  // Every verb that connects opens with this line. It said the URL and nothing else until an
  // agent registered into another org, in another world, with the line reading the same.
  it("names the gateway and where the key was found, on one line", () => {
    writeProfile("box", { url: BOX, key: A_KEY }, home);
    const open = theDoor({ PINECALL_HOME: home });

    expect(open).toBeDefined();
    expect(doorLine(open!)).toBe(`gateway ${BOX} · key from profile`);
  });
});

describe("a machine that knows no gateway", () => {
  it("is nothing at all, rather than a default key from somewhere", () => {
    expect(doorFrom({ PINECALL_HOME: home })).toEqual({
      url: DEFAULT_URL,
      apiKey: undefined,
      source: "none",
    });
  });

  // Two environment names is what it used to say, and neither of them was the fix.
  it("is told the verb that fixes it, and the one that lists what is already kept", () => {
    const said = written();

    expect(theDoor({ PINECALL_HOME: home }, said.stream)).toBeUndefined();
    expect(said.text()).toBe(`${noKey(DEFAULT_URL)}\n`);
    expect(said.text()).toContain("pinecall login http://localhost:8080");
    expect(said.text()).toContain("pinecall config");
  });

  it("cannot be told one by an environment: a key exported here opens nothing", () => {
    const said = written();

    const open = theDoor(
      { PINECALL_HOME: home, PINECALL_API_KEY: A_KEY, PINECALL_URL: BOX, PINECALL_DEV_KEY: "dev" },
      said.stream,
    );

    expect(open).toBeUndefined();
  });
});
