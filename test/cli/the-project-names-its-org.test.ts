// Four checkouts of four orgs shared one active profile, and `pinecall use` was how a person moved
// between them. A project's package.json says its org now, and inside it every verb takes that
// org's profile — and refuses, rather than falling back to the active one, when there is none.

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

import { doorFrom, doorLine, notThisOrg, theDoor } from "../../src/cli/env.js";
import { projectOrg, writeProfile } from "../../src/cli/profiles.js";
import { written } from "./said.js";

const BOX = "https://box.pinecall.io";
const CLOUDACIO = "pk_cloudacio_sandbox";
const TIENDA = "pk_tienda_sandbox";

let home = "";
let projects = "";

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "pinecall-home-"));
  projects = mkdtempSync(join(tmpdir(), "pinecall-projects-"));
  writeProfile("cloudacio", { url: BOX, key: CLOUDACIO, org: "cloudacio" }, home);
  // The login leaves the last org it wrote active: here, the other one.
  writeProfile("tienda-sur", { url: BOX, key: TIENDA, org: "tienda-sur" }, home);
});

function project(name: string, pkg: object): string {
  const dir = join(projects, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify(pkg));
  return dir;
}

describe("a project that names its org", () => {
  it("takes that org's profile, whichever one is active", () => {
    const bidfire = project("bidfire", { name: "bidfire-agents", pinecall: { org: "cloudacio" } });

    const found = doorFrom({ PINECALL_HOME: home }, home, undefined, bidfire);

    expect(found.apiKey).toBe(CLOUDACIO);
    expect(found.profile).toBe("cloudacio");
    expect(found.project).toEqual({ org: "cloudacio", file: join(bidfire, "package.json") });
  });

  it("is found from any directory inside it, past a package.json that names none", () => {
    const bidfire = project("bidfire", { pinecall: { org: "cloudacio" } });
    const inner = project("bidfire/packages/widget", { name: "widget" });
    const deeper = join(inner, "src");
    mkdirSync(deeper);

    expect(projectOrg(deeper)).toEqual({ org: "cloudacio", file: join(bidfire, "package.json") });
    expect(doorFrom({ PINECALL_HOME: home }, home, undefined, deeper).apiKey).toBe(CLOUDACIO);
  });

  it("is refused, never handed the active profile, when this machine holds none of that org", () => {
    const other = project("other", { pinecall: { org: "clinica-norte" } });
    const found = doorFrom({ PINECALL_HOME: home }, home, undefined, other);

    expect(found.apiKey).toBeUndefined();
    expect(notThisOrg(found.project!)).toContain("this project is org clinica-norte");
  });

  it("gives way to --profile", () => {
    const bidfire = project("bidfire", { pinecall: { org: "cloudacio" } });

    expect(doorFrom({ PINECALL_HOME: home }, home, "tienda-sur", bidfire).apiKey).toBe(TIENDA);
  });

  it("says on the first line which org it took, and from which file", () => {
    const bidfire = project("bidfire", { pinecall: { org: "cloudacio" } });
    const found = doorFrom({ PINECALL_HOME: home }, home, undefined, bidfire);

    expect(doorLine({ ...found, apiKey: found.apiKey! })).toBe(
      `gateway ${BOX} · key from profile cloudacio · org cloudacio from ${join(bidfire, "package.json")}`,
    );
  });
});

describe("outside any project", () => {
  it("is the active profile, as it always was", () => {
    const plain = project("plain", { name: "nothing-of-pinecall" });

    expect(doorFrom({ PINECALL_HOME: home }, home, undefined, plain).apiKey).toBe(TIENDA);
  });

  it("tells a verb with no key the usual sentence", () => {
    const said = written();
    const empty = mkdtempSync(join(tmpdir(), "pinecall-home-"));

    expect(theDoor({ PINECALL_HOME: empty }, said.stream)).toBeUndefined();
    expect(said.text()).toContain("not signed in to");
  });
});
