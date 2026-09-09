// Snapshot, diff, restore, collapse: the state read from outside the class.
import { describe, expect, it } from "vitest";

import { changes, collapse, diff, restore, seal, setLast, snapshot } from "../../src/index.js";
import ClinicaNorte from "./clinica-norte.js";

function clinica(): ClinicaNorte {
  return seal(new ClinicaNorte());
}

describe("the snapshot", () => {
  it("leaves the config fields out and keeps the derived getters in", () => {
    const state = snapshot(clinica());
    expect(Object.keys(state).sort()).toEqual([
      "booking",
      "done",
      "identified",
      "patient",
      "slot",
      "slots",
    ]);
    expect(state["identified"]).toBe(false);
  });

  it("reads a getter as the state it is derived from changes", async () => {
    const agent = clinica();
    await agent.findPatient("Ana", "+34 600 000 001");
    expect(snapshot(agent)["identified"]).toBe(true);
  });
});

describe("diff and restore", () => {
  it("round-trips: what diff saw is what restore puts back", async () => {
    const agent = clinica();
    const before = snapshot(agent);
    await agent.findPatient("Ana", "+34 600 000 001");
    await agent.freeSlots("lunes");
    const after = snapshot(agent);

    expect(diff(before, after).map((one) => one.field).sort()).toEqual([
      "identified",
      "patient",
      "slots",
    ]);

    restore(agent, before);
    expect(diff(snapshot(agent), before)).toEqual([]);
    expect(changes(agent).at(-1)?.author).toBe("restore");
  });
});

describe("startIn", () => {
  it("keeps the fields a case does not name, where restore would clear them", () => {
    // A goldens case names the fields it is about — this one is about who is on the line, not
    // about the hours on offer — so `slots` keeps the empty list the class gave itself.
    const started = clinica();
    started.startIn({ patient: { name: "Ana" } });
    expect(snapshot(started)["patient"]).toEqual({ name: "Ana" });
    expect(snapshot(started)["slots"]).toEqual([]);

    // The same case through `restore` is what broke `pinecall prompt`: the field it never
    // mentioned came back undefined, and the view that reads `slots.length` died on it.
    const restored = clinica();
    restore(restored, { patient: { name: "Ana" } });
    expect(snapshot(restored)["slots"]).toBeUndefined();
  });

  it("writes over what the agent already has, field by field", async () => {
    const agent = clinica();
    await agent.freeSlots("lunes");
    const offered = snapshot(agent)["slots"];

    agent.startIn({ patient: { name: "Ana" } });
    expect(snapshot(agent)["slots"]).toEqual(offered);
  });
});

describe("collapse", () => {
  it("keeps the summary and drops the changes that came before it", async () => {
    const agent = clinica();
    await agent.findPatient("Ana", "+34 600 000 001");
    await agent.freeSlots("lunes");
    expect(changes(agent).length).toBeGreaterThan(1);

    collapse(agent, "Ana pidió hora para el lunes.");

    expect(changes(agent)).toHaveLength(1);
    expect(changes(agent)[0]).toMatchObject({
      field: "@summary",
      next: "Ana pidió hora para el lunes.",
      author: "collapse",
    });
    // The state itself survives: what collapsed is the memory of how it got here.
    expect(snapshot(agent)["identified"]).toBe(true);
  });
});

describe("last(contact)", () => {
  it("says it is not wired until a mount gives the agent a store", async () => {
    await expect(clinica().last("+34 600 000 001")).rejects.toThrow(/mount the agent with \{ last \}/);
  });

  it("reads the store its own mount handed it, and never another mount's", async () => {
    const one = clinica();
    const other = clinica();
    setLast(one, async () => ({ patient: { id: "p1" } }));
    await expect(one.last("+34 600 000 001")).resolves.toMatchObject({ patient: { id: "p1" } });
    // The source rode the instance, not the module: the second agent is as unwired as it was.
    await expect(other.last("+34 600 000 001")).rejects.toThrow(/mount the agent with \{ last \}/);
  });
});
