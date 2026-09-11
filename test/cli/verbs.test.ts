// The two verbs a person types at an agent: `run` starts it and says what it registered, and
// binds no port on this machine; `ui` is the one verb that does, on 127.0.0.1 (ui.test.ts).

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { builtNames, groupFor, groupNames, main } from "../../src/cli/index.js";
import { connectedLine, doorsOf, run } from "../../src/cli/run.js";
import { group as ui } from "../../src/cli/ui/index.js";

const GATEWAY = "https://box.pinecall.io";

/** A stream that keeps what was written, so a test reads a verb's output as a string. */
function collected(): { stream: NodeJS.WritableStream; text(): string } {
  const written: string[] = [];
  const stream = { write: (chunk: string) => written.push(chunk) } as unknown as NodeJS.WritableStream;
  return { stream, text: () => written.join("") };
}

describe("the line `pinecall run` prints when the socket is up", () => {
  // It names no page. The console was deleted on 2026-09-08 and the gateway serves none, so a
  // `console <url>` back in this line would be an address nothing answers at.
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

  it("reads the doors from the routes the class registered, and only those", () => {
    expect(doorsOf([{ channel: "phone", number: "+34 910 000 000" }, { channel: "web", number: null }])).toEqual([
      "phone +34 910 000 000",
      "web",
    ]);
    expect(doorsOf(undefined)).toEqual([]);
  });
});

describe("`pinecall run` opens no port", () => {
  // The agent's process serves no UI at all: the console left on 2026-09-08 and the gateway is an
  // API, so nothing under the tenant's CLI listens for a connection. A grep is the honest test of
  // that — a suite cannot prove the absence of a socket, and this catches the file that would
  // bring one back. `pinecall ui` opens one on 127.0.0.1 for the life of the command, from
  // exactly one file, and that file is the only one named here (ui.test.ts pins what it does).
  it("has nothing under cli/ that binds one, but the console's own server", () => {
    const cli = fileURLToPath(new URL("../../src/cli/", import.meta.url));

    for (const file of sources(cli)) {
      if (file.endsWith("/ui/server.ts")) continue;
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

// `serve` promised a port and a server; the agent opens one outbound socket and listens on
// nothing, so the verb was renamed on 2026-09-08 (docs/decisions/tenant-cli.md). Rename, not
// alias: nothing was published and nobody had a .env, and an alias today is a deprecation
// carried forever. This pins that the old word is gone and that the answer names the new one.
describe("`serve` is not a verb of this CLI", () => {
  it("is refused, and the usage a person is handed names `run`", async () => {
    const out = collected();
    const err = collected();

    const code = await main(["serve"], out.stream, err.stream);

    expect(code).toBe(2);
    expect(err.text()).toContain("no such group: serve");
    expect(err.text()).toContain("run       the app and its doors: the process you deploy");
  });

  it("is not a group the CLI declares, planned or built", () => {
    expect(groupNames()).not.toContain("serve");
    expect(groupNames()).toContain("run");
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

describe("`pinecall ui [agent]` says what it is in one line", () => {
  it("names the console and what it holds, never a port a person has to know", () => {
    expect(ui.purpose).toContain("console");
    expect(ui.purpose).toContain("talk");
    expect(ui.purpose).not.toMatch(/\d{4}/);
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
