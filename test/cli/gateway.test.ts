/** `pinecall gateway`: the cloud until this machine says otherwise, and one word to say it. */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import { CLOUD_URL, doorFrom } from "../../src/cli/env.js";
import { run } from "../../src/cli/gateway.js";
import { theGateway } from "../../src/cli/login.js";
import { chosenGateway } from "../../src/cli/profiles.js";
import { written } from "./said.js";

let home = "";

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "pinecall-gateway-"));
});

describe("a machine nobody has pointed anywhere", () => {
  it("is on the cloud, and says the default is a default", () => {
    const said = written();

    expect(run([], { out: said.stream, home })).toBe(0);
    expect(said.text()).toContain(CLOUD_URL);
    expect(said.text()).toContain("the default");
    expect(theGateway(undefined, home).url).toBe(CLOUD_URL);
  });
});

describe("a machine pointed at its own box", () => {
  it("keeps it, and every verb that has no key goes there", () => {
    const said = written();

    expect(run(["https://voz.clinica.com"], { out: said.stream, home })).toBe(0);

    expect(chosenGateway(home)).toBe("https://voz.clinica.com");
    expect(theGateway(undefined, home).url).toBe("https://voz.clinica.com");
    expect(doorFrom({ PINECALL_HOME: home }, home).url).toBe("https://voz.clinica.com");
    expect(said.text()).toContain("pinecall login");
  });

  // A person types the host, because that is what they were given.
  it("takes an address with no scheme as https, and keeps the origin alone", () => {
    expect(run(["voz.clinica.com/v1/whoami"], { out: written().stream, home })).toBe(0);

    expect(chosenGateway(home)).toBe("https://voz.clinica.com");
  });

  it("refuses what is not an address, rather than keeping it for the next verb to trip on", () => {
    const said = written();

    expect(run(["not a url"], { err: said.stream, home })).toBe(2);

    expect(chosenGateway(home)).toBeUndefined();
    expect(said.text()).toContain("not a gateway URL");
  });

  // `pinecall login <url>` still works, and a URL typed on the line wins over the kept one.
  it("is overruled by a URL the login itself names", () => {
    run(["https://voz.clinica.com"], { out: written().stream, home });

    expect(theGateway("https://other.example", home)).toEqual({ url: "https://other.example" });
  });
});
