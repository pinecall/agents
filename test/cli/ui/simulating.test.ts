// The console's simulation door: which class it is for, what it refuses, and when it answers.

import { describe, expect, it } from "vitest";

import type { Simulated, Simulation } from "../../../src/cli/simulate.js";
import type { Persona } from "../../../src/cli/testing/caller.js";
import { Refusal } from "../../../src/cli/ui/refusal.js";
import { simulatingFrom } from "../../../src/cli/ui/simulating.js";

const DOOR = { url: "http://127.0.0.1:1", apiKey: "pk_never_sent_anywhere" };
const APURADO: Persona = { name: "apurado", goal: "cambiar la cita hoy", style: "rápido, corta frases" };

function quiet(): NodeJS.WritableStream {
  return { write: () => true } as unknown as NodeJS.WritableStream;
}

/** A simulation that opens a call at once and then hangs up, remembering how it was asked. */
function opensACall(): { asked: Simulation[]; simulate: (p: Persona, how: Simulation) => Promise<Simulated | undefined> } {
  const asked: Simulation[] = [];
  return {
    asked,
    simulate: async (_persona, how) => {
      asked.push(how);
      how.opened?.("call_abc");
      return { call: "call_abc" };
    },
  };
}

describe("the roster", () => {
  it("names the class of this directory and lists every persona without its facts", async () => {
    const door = simulatingFrom(DOOR, "clinica-norte", quiet(), {
      personas: async () => [{ ...APURADO, facts: { phone: "600000001" } }],
      simulate: async () => undefined,
    });
    expect(await door.roster()).toEqual({
      agent: "clinica-norte",
      personas: [{ name: "apurado", goal: APURADO.goal, style: APURADO.style }],
    });
  });
});

describe("starting one", () => {
  it("answers the call id the moment the simulation names it, with the terminal's own defaults", async () => {
    const opening = opensACall();
    const door = simulatingFrom(DOOR, "clinica-norte", quiet(), { personas: async () => [APURADO], simulate: opening.simulate });

    const started = await door.start({ agent: "clinica-norte", persona: "apurado" });

    expect(started).toEqual({ call: "call_abc" });
    expect(opening.asked[0]).toMatchObject({ door: DOOR, judge: false, voice: false, turns: 6 });
    expect(opening.asked[0]?.degraded).toBeUndefined();
  });

  it("spoils the line the way the flags do: dB under the caller, and percent as a share", async () => {
    const opening = opensACall();
    const door = simulatingFrom(DOOR, "clinica-norte", quiet(), { personas: async () => [APURADO], simulate: opening.simulate });

    await door.start({ agent: "clinica-norte", persona: "apurado", voice: true, background_noise: 12, packet_loss: 2 });

    expect(opening.asked[0]?.degraded).toEqual({ interferer_db: 12, packet_loss: 0.02 });
  });

  it("refuses a spoiled line on a written call, as the terminal does", async () => {
    const door = simulatingFrom(DOOR, "clinica-norte", quiet(), { personas: async () => [APURADO], simulate: async () => undefined });
    await expect(door.start({ agent: "clinica-norte", persona: "apurado", packet_loss: 2 })).rejects.toMatchObject({
      status: 422,
    });
  });

  it("refuses another agent: the class mounted here is this directory's", async () => {
    const door = simulatingFrom(DOOR, "clinica-norte", quiet(), { personas: async () => [APURADO], simulate: async () => undefined });
    await expect(door.start({ agent: "tienda-sur", persona: "apurado" })).rejects.toBeInstanceOf(Refusal);
    await expect(door.start({ agent: "tienda-sur", persona: "apurado" })).rejects.toMatchObject({ status: 409 });
  });

  it("refuses a persona nobody wrote, naming where one would be", async () => {
    const door = simulatingFrom(DOOR, "clinica-norte", quiet(), { personas: async () => [APURADO], simulate: async () => undefined });
    await expect(door.start({ agent: "clinica-norte", persona: "tranquilo" })).rejects.toMatchObject({
      status: 404,
      message: expect.stringContaining("test/personas") as string,
    });
  });

  it("refuses a body that is not what the page sends", async () => {
    const door = simulatingFrom(DOOR, "clinica-norte", quiet(), { personas: async () => [APURADO], simulate: async () => undefined });
    await expect(door.start({ persona: 3 })).rejects.toMatchObject({ status: 422 });
  });

  it("refuses when the simulation ends without ever opening a call", async () => {
    const door = simulatingFrom(DOOR, "clinica-norte", quiet(), {
      personas: async () => [APURADO],
      simulate: async () => undefined,
    });
    await expect(door.start({ agent: "clinica-norte", persona: "apurado" })).rejects.toMatchObject({ status: 502 });
  });

  it("carries a simulation's own failure as the refusal, and prints it where the terminal would", async () => {
    const written: string[] = [];
    const out = { write: (chunk: string) => written.push(chunk) } as unknown as NodeJS.WritableStream;
    const door = simulatingFrom(DOOR, "clinica-norte", out, {
      personas: async () => [APURADO],
      simulate: async () => {
        throw new Error("no app holds clinica-norte");
      },
    });
    await expect(door.start({ agent: "clinica-norte", persona: "apurado" })).rejects.toMatchObject({
      status: 502,
      message: "no app holds clinica-norte",
    });
    expect(written.join("")).toContain("no app holds clinica-norte");
  });
});
