// The console's goldens door: which class it is for, what it refuses, and when it answers.

import { describe, expect, it } from "vitest";

import type { Golden } from "../../../src/cli/testing/goldens.js";
import { Refused } from "../../../src/cli/ui/refused.js";
import { testingFrom, type Pieces } from "../../../src/cli/ui/testing.js";

const DOOR = { url: "http://127.0.0.1:1", apiKey: "pk_never_sent_anywhere" };
const RESERVA: Golden = { name: "reserva", input: ["Sí, confírmemela."], expect: { tools: ["book"] } };
const IDENTIFICA: Golden = { name: "identifica", input: ["Hola"], state: { stage: "identify" } };

function quiet(): NodeJS.WritableStream {
  return { write: () => true } as unknown as NodeJS.WritableStream;
}

/** A suite that the gateway lists as running the moment it is asked, and that then finishes. */
function opensARun(): { asked: Golden[][]; pieces: Pieces } {
  const asked: Golden[][] = [];
  let running: string | undefined;
  return {
    asked,
    pieces: {
      goldens: async () => [RESERVA, IDENTIFICA],
      suite: async (_door, goldens) => {
        asked.push(goldens);
        running = "run_from_the_page";
        await new Promise((wake) => setTimeout(wake, 600));
        return 0;
      },
      running: async () => running,
    },
  };
}

describe("the roster", () => {
  it("names the class of this directory and lists every golden with what it says and expects", async () => {
    const door = testingFrom(DOOR, "clinica-norte", quiet(), opensARun().pieces);
    expect(await door.roster()).toEqual({
      agent: "clinica-norte",
      goldens: [
        { name: "reserva", input: ["Sí, confírmemela."], expect: { tools: ["book"] } },
        { name: "identifica", input: ["Hola"], expect: {} },
      ],
    });
  });
});

describe("running the ticked ones", () => {
  it("answers the run's id as soon as the gateway lists it, and runs only what was ticked", async () => {
    const opening = opensARun();
    const door = testingFrom(DOOR, "clinica-norte", quiet(), opening.pieces);

    const started = await door.start({ agent: "clinica-norte", goldens: ["identifica"] });

    expect(started).toEqual({ run: "run_from_the_page" });
    expect(opening.asked[0]?.map((golden) => golden.name)).toEqual(["identifica"]);
  });

  it("refuses a golden nobody wrote, by name", async () => {
    const door = testingFrom(DOOR, "clinica-norte", quiet(), opensARun().pieces);
    await expect(door.start({ agent: "clinica-norte", goldens: ["reserva", "nadie"] })).rejects.toMatchObject({
      status: 404,
      message: "no golden called nadie",
    });
  });

  it("refuses another agent: the class mounted here is this directory's", async () => {
    const door = testingFrom(DOOR, "clinica-norte", quiet(), opensARun().pieces);
    await expect(door.start({ agent: "tienda-sur", goldens: ["reserva"] })).rejects.toBeInstanceOf(Refused);
  });

  it("refuses a noisy line on a written run, and an empty list", async () => {
    const door = testingFrom(DOOR, "clinica-norte", quiet(), opensARun().pieces);
    await expect(door.start({ agent: "clinica-norte", goldens: ["reserva"], packet_loss: 0.02 })).rejects.toMatchObject({
      status: 422,
    });
    await expect(door.start({ agent: "clinica-norte", goldens: [] })).rejects.toMatchObject({ status: 422 });
  });

  it("refuses when the suite ends before the gateway ever lists a run, and prints why", async () => {
    const written: string[] = [];
    const out = { write: (chunk: string) => written.push(chunk) } as unknown as NodeJS.WritableStream;
    const door = testingFrom(DOOR, "clinica-norte", out, {
      goldens: async () => [RESERVA],
      suite: async () => {
        throw new Error("no key for http://127.0.0.1:1");
      },
      running: async () => undefined,
    });
    await expect(door.start({ agent: "clinica-norte", goldens: ["reserva"] })).rejects.toMatchObject({ status: 502 });
    expect(written.join("")).toContain("no key for");
  });
});
