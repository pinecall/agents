// The console's memory door: the two goldens of this directory, and what it refuses to run.

import type { ExtractionGolden, ExtractionRun } from "@pinecall/protocol";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { rememberingFrom, type Pieces } from "../../../src/cli/ui/remembering.js";

const DOOR = { url: "http://127.0.0.1:1", apiKey: "pk_never_sent_anywhere" };

const A_CASE: ExtractionGolden = {
  name: "la-primera-cita",
  said: [
    ["caller", "me llamo Ana García"],
    ["agent", "gracias, Ana"],
  ],
};

const RAN: ExtractionRun = {
  agent: "clinica-norte",
  model: "claude-haiku-4-5",
  cases: 1,
  held: 1,
  took_ms: 812,
  results: [{ name: A_CASE.name, held: true }],
};

/** A directory with a recall golden of two questions and one extraction case beside it. */
function aDirectory(cases: ExtractionGolden[] = [A_CASE]): { pieces: Pieces; ran: ExtractionGolden[][] } {
  const root = mkdtempSync(join(tmpdir(), "pinecall-memory-"));
  const golden = join(root, "golden.json");
  writeFileSync(
    golden,
    JSON.stringify([
      { holds: ["se llama Ana"], asks: "¿cómo me llamo?", expects: ["se llama Ana"] },
      { holds: ["vive en Madrid"], asks: "¿dónde vivo?", expects: ["vive en Madrid"] },
    ]),
  );
  const ran: ExtractionGolden[][] = [];
  return {
    ran,
    pieces: {
      cases: async () => cases,
      extract: async (_door, asked) => {
        ran.push(asked);
        return RAN;
      },
      golden: async () => ({ agent: "clinica-norte", golden }),
    },
  };
}

describe("what this directory holds", () => {
  it("names the recall golden's questions and every extraction case", async () => {
    const door = rememberingFrom(DOOR, "clinica-norte", aDirectory().pieces);

    expect(await door.roster()).toMatchObject({ agent: "clinica-norte", questions: 2, cases: ["la-primera-cita"] });
  });
});

describe("running them", () => {
  it("sends every case through the class of this directory", async () => {
    const directory = aDirectory();
    const door = rememberingFrom(DOOR, "clinica-norte", directory.pieces);

    expect(await door.extract({ agent: "clinica-norte" })).toEqual(RAN);
    expect(directory.ran[0]?.map((one) => one.name)).toEqual(["la-primera-cita"]);
  });

  it("refuses another agent, and a directory with no case in it", async () => {
    const door = rememberingFrom(DOOR, "clinica-norte", aDirectory().pieces);
    await expect(door.extract({ agent: "tienda-sur" })).rejects.toMatchObject({ status: 409 });
    await expect(door.recall({ agent: "tienda-sur" })).rejects.toMatchObject({ status: 409 });

    const empty = rememberingFrom(DOOR, "clinica-norte", aDirectory([]).pieces);
    await expect(empty.extract({ agent: "clinica-norte" })).rejects.toMatchObject({ status: 404 });
  });

  it("refuses a golden that is not there, naming where it looked", async () => {
    const door = rememberingFrom(DOOR, "clinica-norte", {
      cases: async () => [],
      extract: async () => RAN,
      golden: async () => ({ agent: "clinica-norte", golden: "/nowhere/memory/golden.json" }),
    });

    await expect(door.recall({ agent: "clinica-norte" })).rejects.toMatchObject({
      status: 404,
      message: expect.stringContaining("/nowhere/memory/golden.json") as string,
    });
  });
});
