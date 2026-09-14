// ~/.pinecall: what is kept there, what is left alone, and what is not trusted. Every test here
// runs against a temporary directory — the real ~/.pinecall is never read and never written.

import { chmodSync, mkdtempSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

import { gatewayFor, normalised, pinecallHome, readCredentials, writeGateway } from "../../src/cli/credentials.js";

const A_KEY = "pk_a_key_no_gateway_will_ever_honour";
const A_DEV_KEY = "a-dev-key-nobody-will-ever-deploy";

let home = "";

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "pinecall-home-"));
});

/** One file in this test's own ~/.pinecall, at the mode the test is about. */
function wrote(name: string, text: string, mode = 0o600): string {
  const path = join(home, name);
  writeFileSync(path, text, { mode });
  chmodSync(path, mode);
  return path;
}

describe("the directory these files live in", () => {
  it("is ~/.pinecall, and PINECALL_HOME is the whole of the override", () => {
    expect(pinecallHome({ PINECALL_HOME: "/tmp/somewhere" })).toBe("/tmp/somewhere");
    expect(pinecallHome({ HOME: "/home/nobody" })).toMatch(/\.pinecall$/);
  });
});

describe("the credentials file", () => {
  it("is an empty table when there is none at all", () => {
    expect(readCredentials(home)).toEqual({ gateways: {} });
    expect(gatewayFor("http://127.0.0.1:8080", home)).toBeUndefined();
  });

  it("reads v1's own file — one key, no gateways — as no gateways and nothing else", () => {
    wrote("credentials", JSON.stringify({ api_key: A_KEY }));

    expect(readCredentials(home)).toEqual({ api_key: A_KEY, gateways: {} });
  });

  it("keeps v1's api_key exactly where it was when a gateway is written beside it", () => {
    wrote("credentials", JSON.stringify({ api_key: A_KEY }));

    writeGateway("https://box.pinecall.io", { api_key: "pk_the_orgs_own", org: "clinica" }, home);

    const kept = readCredentials(home);
    expect(kept.api_key).toBe(A_KEY);
    expect(kept.gateways["https://box.pinecall.io"]?.org).toBe("clinica");
  });

  it("is readable by nobody else, and narrows one that was written wider", () => {
    wrote("credentials", JSON.stringify({ api_key: A_KEY }), 0o644);

    writeGateway("https://box.pinecall.io", { api_key: "pk_the_orgs_own", org: "clinica" }, home);

    expect(statSync(join(home, "credentials")).mode & 0o777).toBe(0o600);
  });

  it("stamps when the key was kept, so a person can tell an old row from today's", () => {
    writeGateway("https://box.pinecall.io", { api_key: "pk_the_orgs_own", org: "clinica" }, home);

    const row = gatewayFor("https://box.pinecall.io", home);
    expect(Date.parse(row?.logged_in_at ?? "")).toBeGreaterThan(0);
  });

  it("finds the row again however the URL was typed the second time", () => {
    writeGateway("https://Box.Pinecall.io/", { api_key: "pk_the_orgs_own", org: "clinica" }, home);

    expect(gatewayFor("https://box.pinecall.io", home)?.org).toBe("clinica");
    expect(normalised("HTTP://127.0.0.1:8080/")).toBe("http://127.0.0.1:8080");
  });

  it("is an empty table rather than an exception when what is there is not JSON", () => {
    wrote("credentials", "{ this was edited by hand");

    expect(readCredentials(home)).toEqual({ gateways: {} });
  });
});
