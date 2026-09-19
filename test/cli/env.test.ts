// Which gateway and which key: the project's, the way any app reads its own — PINECALL_KEY and
// PINECALL_URL from the environment, else from the nearest `.env` up from where the verb runs.

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

import { CLOUD_URL, doorFrom, doorLine, NO_KEY, theDoor } from "../../src/cli/env.js";
import { readDotenv, writeDotenv } from "../../src/cli/dotenv.js";
import { withoutTheWorldFlag } from "../../src/cli/world.js";
import { written } from "./said.js";

const BOX = "http://127.0.0.1:8080";
const A_KEY = "pc_the_persons_own_key_nobody_will_deploy";

let project = "";

beforeEach(() => {
  project = mkdtempSync(join(tmpdir(), "pinecall-project-"));
  withoutTheWorldFlag([]);
});

describe("the door a verb is handed", () => {
  it("is the project's .env, read from the folder the verb runs in or any under it", () => {
    writeFileSync(join(project, ".env"), `# the app's own\nPINECALL_KEY=${A_KEY}\nPINECALL_URL="${BOX}"\n`);
    const deeper = join(project, "agents", "clinica");
    mkdirSync(deeper, { recursive: true });

    expect(doorFrom({}, deeper)).toEqual({ url: BOX, apiKey: A_KEY, source: join("..", "..", ".env") });
  });

  it("is the environment's first: a server's secrets, a CI job's", () => {
    writeFileSync(join(project, ".env"), "PINECALL_KEY=pc_the_file\n");

    expect(doorFrom({ PINECALL_KEY: A_KEY }, project)).toEqual({ url: CLOUD_URL, apiKey: A_KEY, source: "the environment" });
  });

  // Every verb that connects opens with this line: which gateway, where the key was read, and the
  // world when --prod named one.
  it("names the gateway, where the key was read and --prod, on one line", () => {
    writeFileSync(join(project, ".env"), `PINECALL_KEY=${A_KEY}\n`);
    withoutTheWorldFlag(["sessions", "--prod"]);
    const open = theDoor({}, written().stream, project);

    expect(open).toBeDefined();
    expect(doorLine(open!)).toBe(`gateway ${CLOUD_URL} · key from .env · production (--prod)`);
  });
});

describe("a folder nobody linked", () => {
  it("is told the verb that links it", () => {
    const said = written();

    expect(theDoor({}, said.stream, project)).toBeUndefined();
    expect(said.text()).toBe(`${NO_KEY}\n`);
    expect(said.text()).toContain("`pinecall link`");
  });

  // v1 exported PINECALL_API_KEY, and a shell that still had it handed another org's key over in
  // silence. The name this CLI reads is one v1 never used.
  it("never reads v1's PINECALL_API_KEY", () => {
    expect(theDoor({ PINECALL_API_KEY: A_KEY }, written().stream, project)).toBeUndefined();
  });
});

describe("the .env link writes", () => {
  it("replaces its own lines where they stand and leaves the app's alone", () => {
    const file = join(project, ".env");
    writeFileSync(file, "DATABASE_URL=postgres://x\nPINECALL_KEY=pc_old\n");

    writeDotenv(file, { PINECALL_KEY: A_KEY, PINECALL_URL: BOX });

    expect(readDotenv(file)).toEqual({ DATABASE_URL: "postgres://x", PINECALL_KEY: A_KEY, PINECALL_URL: BOX });
  });
});

describe("--prod", () => {
  it("is taken out of the argv every group reads, and names production for this command only", () => {
    expect(withoutTheWorldFlag(["agent", "set", "--prod", "--voice", "carolina"])).toEqual(["agent", "set", "--voice", "carolina"]);
    writeFileSync(join(project, ".env"), `PINECALL_KEY=${A_KEY}\n`);
    expect(doorFrom({}, project).world).toBe("production");
    withoutTheWorldFlag(["agent"]);
    expect(doorFrom({}, project).world).toBeUndefined();
  });
});
