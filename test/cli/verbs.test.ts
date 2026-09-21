// The verb a person types at an agent: `start` starts it, says what it registered, prints where the
// console is, and binds no port on this machine — the gateway serves the page.

import { readdirSync, readFileSync } from "node:fs";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { builtNames, groupFor, groupNames, main, usage } from "../../src/cli/index.js";
import { PLANNED } from "../../src/cli/groups.js";
import { Refused } from "../../src/cli/testing/gateway.js";
import { connectedLine, doorsOf } from "../../src/cli/connected.js";
import { run } from "../../src/cli/start.js";
import { CLOUD_URL, SANDBOX_URL } from "../../src/cli/env.js";
import { consoleFor, consoleUrl, whyNoConsole } from "../../src/cli/start-console.js";

const GATEWAY = "https://box.pinecall.io";

/** A stream that keeps what was written, so a test reads a verb's output as a string. */
function collected(): { stream: NodeJS.WritableStream; text(): string } {
  const written: string[] = [];
  const stream = { write: (chunk: string) => written.push(chunk) } as unknown as NodeJS.WritableStream;
  return { stream, text: () => written.join("") };
}

describe("the line `pinecall start` prints when the socket is up", () => {
  // It names no page: the console's URL is its own line, minted after the socket is up, because
  // it carries a one-use code this line cannot have before the gateway answers.
  it("names the agent, the gateway, the tools and the doors, and no page", () => {
    const line = connectedLine({
      slug: "clinica-norte",
      url: GATEWAY,
      tools: 4,
      doors: ["phone +34 910 000 000", "web"],
    });

    expect(line).toBe(
      "clinica-norte · connected to https://box.pinecall.io · tools 4 · doors phone +34 910 000 000, web",
    );
    expect(line).not.toContain("console");
  });

  it("says no doors at all for an agent that declared none", () => {
    const line = connectedLine({ slug: "tienda-sur", url: GATEWAY, tools: 0, doors: [] });

    expect(line).toBe("tienda-sur · connected to https://box.pinecall.io · tools 0");
  });

  // The line used to say the gateway and nothing else, and a key exported in the shell wins over
  // the one `pinecall login` kept — so an agent could land in another org, in another world, with
  // this line reading exactly the same. Where you are IS the key you hold, so the line says it.
  it("says whose org took it, which world, and where the key came from", () => {
    const line = connectedLine({
      slug: "clinica-norte",
      url: GATEWAY,
      tools: 4,
      doors: ["web"],
      org: "acme",
      env: "sandbox",
      source: "credentials",
    });

    expect(line).toBe(
      "clinica-norte · acme · sandbox · connected to https://box.pinecall.io"
        + " · key from credentials · tools 4 · doors web",
    );
  });

  it("says none of it rather than guessing when the gateway would not answer", () => {
    const line = connectedLine({ slug: "clinica-norte", url: GATEWAY, tools: 1, doors: [], source: "env" });

    expect(line).toBe("clinica-norte · connected to https://box.pinecall.io · key from env · tools 1");
  });

  it("reads the doors from the routes the class registered, and only those", () => {
    expect(doorsOf([{ channel: "phone", number: "+34 910 000 000" }, { channel: "web", number: null }])).toEqual([
      "phone +34 910 000 000",
      "web",
    ]);
    expect(doorsOf(undefined)).toEqual([]);
  });
});

describe("the console's URL `pinecall start` and `pinecall console` print", () => {
  // The box serves the console at /a/<agent> under each of its names, and the browser signs in
  // with a one-use code this process minted: the code rides the URL once, the key never does.
  it("is the console's page for this agent, with the code, and never a key", () => {
    expect(consoleUrl("https://box.pinecall.io/", "clinica-norte", "lc_abc")).toBe(
      "https://box.pinecall.io/a/clinica-norte?login=lc_abc",
    );
    expect(consoleUrl(GATEWAY, "tienda sur", "lc_a/b")).toBe("https://box.pinecall.io/a/tienda%20sur?login=lc_a%2Fb");
  });

  it("is the org's floor when no agent was named", () => {
    expect(consoleUrl(SANDBOX_URL, undefined, "lc_abc")).toBe("https://sandbox.pinecall.io/?login=lc_abc");
  });

  // Production's console is the gateway itself; the sandbox's is the box's OTHER name, which this
  // CLI knows for the cloud alone — a tenant's own box is named by its own operator.
  it("names the sandbox's console for the cloud, and refuses to guess another box's", () => {
    expect(consoleFor(CLOUD_URL, "production")).toBe(CLOUD_URL);
    expect(consoleFor(CLOUD_URL, "sandbox")).toBe(SANDBOX_URL);
    expect(consoleFor("https://box.acme.test/", "production")).toBe("https://box.acme.test");
    expect(consoleFor("https://box.acme.test", "sandbox")).toBeUndefined();
  });

  it("says a gateway with no login-code door is an old one, and what to do about it", () => {
    // The one status that means something a person can act on: there is no such door, so the
    // gateway predates this CLI. A long-running dev gateway is how anybody meets it.
    const older = whyNoConsole(new Refused(404, "Not Found"));
    expect(older).toContain("older than this CLI");
    expect(older).toContain("Restart it");
    // Anything else is the gateway's own sentence, which is what a person acts on: a server's
    // token that cannot sign a browser in says so, where a bare status said nothing.
    expect(whyNoConsole(new Refused(403, '{"detail":"a server\'s token names nobody"}'))).toBe(
      "the gateway answered 403: a server's token names nobody",
    );
    expect(whyNoConsole(new Error("connect ECONNREFUSED"))).toBe("connect ECONNREFUSED");
  });
});

describe("`pinecall start` opens no port", () => {
  // The agent's process serves no UI. One directory under the tenant's CLI still listens for a
  // connection — `cli/serve/`, the sandbox's console on a laptop — and it is TEMPORARY: the box
  // serves that console at its second name since 2026-09-21, and the exception goes with the
  // directory. A grep is the honest test of that — a suite cannot prove the absence of a socket,
  // and this catches the file that would bring a second one in.
  it("has nothing under cli/ that binds one, but the sidecar", () => {
    const cli = fileURLToPath(new URL("../../src/cli/", import.meta.url));
    const sidecar = join(cli, "serve") + sep;

    for (const file of sources(cli).filter((one) => !one.startsWith(sidecar))) {
      const source = readFileSync(file, "utf8");
      expect(`${file}: ${source.includes("createServer")}`).toBe(`${file}: false`);
      expect(`${file}: ${/\.listen\(/.test(source)}`).toBe(`${file}: false`);
    }
  });

  it("takes no --console, no --console-port and no --open", async () => {
    await expect(run(["--console"])).rejects.toThrow(/console/);
    await expect(run(["--open"])).rejects.toThrow(/open/);
  });
});

// `serve` was this verb's first name and was taken from it on 2026-09-08, because it promised a
// port and the agent listens on nothing. The word came back on 2026-09-17 for the thing that DID
// bind one — the sandbox's console on this machine — and went for good on 2026-09-21, when the box
// took that console under its own second name. What opens a console now opens a browser at the
// box: `pinecall console`, which binds nothing either. `start` is the process you deploy.
describe("`console` opens the page and `start` is the app", () => {
  it("declares both, each saying which it is", () => {
    expect(groupNames()).toContain("console");
    expect(usage()).toContain("start     the app and its doors: the process you deploy");
    expect(usage()).toContain("console   the box's console in a browser");
  });

  // TEMPORARY: `serve` is the same console on a laptop, for as long as a box may have no second
  // name to serve it at. It goes with `cli/serve/`, and this line goes with it.
  it("still declares `serve`, which puts that console on this machine", () => {
    expect(groupNames()).toContain("serve");
    expect(usage()).toContain("serve     that same console on this machine");
  });
});

// The top-level usage is a hand-written table, and it drifted both ways: it advertised `ui` for
// four days after that verb was deleted — `pinecall ui` answered `no such group: ui` while the
// help said it was there — and it never grew a row for `line`, which has been built and
// documented all along. A person reads that table to find out what exists.
describe("`pinecall --help` names every verb there is, and nothing else", () => {
  it("has one row per built group, and no row for a group that is gone", async () => {
    const out = collected();

    await main(["--help"], out.stream, collected().stream);

    const rows = [...out.text().matchAll(/^ {2}([a-z]+) {1,}\S/gm)].map((row) => row[1]!);
    const named = rows.filter((name) => !Object.keys(PLANNED).includes(name));
    expect(named.sort()).toEqual([...builtNames()].sort());
  });

  it("names the planned ones too, each said to be unbuilt", async () => {
    const out = collected();

    await main(["--help"], out.stream, collected().stream);

    for (const name of Object.keys(PLANNED)) {
      expect(out.text()).toContain(`${name.padEnd(10)}`);
    }
    expect(out.text()).toContain("not built yet");
  });
});

// A verb whose --help is one line is a verb whose flags are in the source and nowhere else. The
// dispatcher prints `usage` under the purpose, so having one IS having a help page.
describe("every built verb has a help page", () => {
  it("prints its usage under its purpose, and the usage names the verb", async () => {
    const quiet = { write: () => true } as unknown as NodeJS.WritableStream;
    const silent: string[] = [];
    for (const name of builtNames()) {
      const code = await main([name, "--help"], quiet, quiet);
      if (code !== 0) continue;
      const group = await groupFor(name);
      if (group === undefined) continue;
      if (group.usage === undefined || !group.usage.includes(`pinecall ${name}`)) silent.push(name);
    }

    expect(silent, "give the group a `usage` naming its flags").toEqual([]);
  });
});

// `ui` bound 127.0.0.1 for four days and was deleted: the console is a page the box serves, not
// something this CLI runs. `serve` does bind one still, and is the exception on its way out.
describe("`ui` is not a verb of this CLI", () => {
  it("is refused, and the usage names `console`, which opens the page", async () => {
    const out = collected();
    const err = collected();

    const code = await main(["ui"], out.stream, err.stream);

    expect(code).toBe(2);
    expect(err.text()).toContain("no such group: ui");
    expect(groupNames()).not.toContain("ui");
    expect(usage()).toContain("console   the box's console in a browser");
  });
});

// Deleting a verb is not deleting the sentences that name it. `ui` was gone for four days and
// eleven places still told people to type it — the supervise desk, `pipeline --help`, what a
// simulation prints at the end, and the console's own Evals page, in a <code> a person reads on
// screen. The usage table above is pinned by name; this pins the prose.
describe("no line of this CLI tells anybody to type a verb that is gone", () => {
  it("never says `pinecall ui`, except where it says it is gone", () => {
    const cli = fileURLToPath(new URL("../../src/cli/", import.meta.url));
    const guilty: string[] = [];

    for (const file of sources(cli)) {
      for (const [n, line] of readFileSync(file, "utf8").split("\n").entries()) {
        if (!/pinecall ui\b/.test(line)) continue;
        // The one honest mention: the sentence that says the verb is not one.
        if (/not a verb|no such group|is gone|are gone/.test(line)) continue;
        guilty.push(`${file}:${n + 1}`);
      }
    }

    expect(guilty).toEqual([]);
  });
});

/** Every .ts under a directory, its subdirectories included. */
function sources(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...sources(path));
    else if (entry.name.endsWith(".ts")) found.push(path);
  }
  return found;
}
