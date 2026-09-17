/** One login keeps every org of a person's, with both worlds in each: `pinecall use` is the whole of moving. */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import { use } from "../../src/cli/config.js";
import { doorFrom } from "../../src/cli/env.js";
import { inWorld, nameForOrg, readConfig, writeProfile } from "../../src/cli/profiles.js";
import { written } from "./said.js";

const BOX = "https://box.pinecall.io";
let home = "";

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "pinecall-worlds-"));
  writeProfile("clinica", { url: BOX, key: "pk_sandbox", keys: { sandbox: "pk_sandbox", production: "pk_production" }, org: "clinica", env: "sandbox" }, home);
});

describe("a profile that holds both worlds", () => {
  it("moves to production with the key the login minted, and every verb follows", async () => {
    const said = written();

    expect(await use(["clinica", "production"], { out: said.stream, home })).toBe(0);

    expect(doorFrom({ PINECALL_HOME: home }, home)).toEqual({ url: BOX, apiKey: "pk_production", source: "profile" });
    expect(readConfig(home).profiles["clinica"]?.env).toBe("production");
    expect(said.text()).toContain("clinica · production");
  });

  it("moves back, and the sandbox key is the one in hand again", async () => {
    await use(["clinica", "production"], { out: written().stream, home });
    await use(["clinica", "sandbox"], { out: written().stream, home });

    expect(doorFrom({ PINECALL_HOME: home }, home).apiKey).toBe("pk_sandbox");
  });

  it("refuses a world that is neither, in a sentence", async () => {
    const said = written();

    expect(await use(["clinica", "staging"], { err: said.stream, home })).toBe(2);
    expect(said.text()).toContain("sandbox or production");
  });
});

describe("a profile kept before the login minted both", () => {
  it("says the login that fixes it, and changes nothing", async () => {
    writeProfile("vieja", { url: BOX, key: "pk_old", org: "vieja", env: "sandbox" }, home);
    const said = written();

    expect(await use(["vieja", "production"], { err: said.stream, home })).toBe(2);

    expect(said.text()).toContain("pinecall login");
    expect(inWorld("vieja", "production", home)).toBe("nokey");
    expect(readConfig(home).profiles["vieja"]?.key).toBe("pk_old");
  });
});

describe("an org's profile name", () => {
  it("is its slug, and carries the host when another gateway already took the slug", () => {
    const config = readConfig(home);

    expect(nameForOrg("clinica", BOX, config)).toBe("clinica");
    expect(nameForOrg("clinica", "https://voz.otra.com", config)).toBe("clinica@voz.otra.com");
    expect(nameForOrg("tienda", BOX, config)).toBe("tienda");
  });
});
