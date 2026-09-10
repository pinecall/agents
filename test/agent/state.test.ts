// Snapshot, diff, restore, collapse: the state read from outside the class.
import { describe, expect, it } from "vitest";

import {
  Agent,
  changes,
  collapse,
  diff,
  restore,
  seal,
  setLast,
  snapshot,
  state,
  tool,
  UnauthoredWrite,
  visibilityOf,
} from "../../src/index.js";
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

// `@state` is three spellings of one declaration, and declaring ANY field turns the rule around:
// from "every own field is state" to "these, and nothing else". See docs/writing-an-agent.md.
describe("the fields a class declares with @state", () => {
  /** Una tienda que dice cuáles de sus campos son el estado. */
  class Declarada extends Agent {
    language = "es";

    @state stage = "browse";
    @state({ pii: true }) customer?: { name: string };
    @state({ visibility: "public" }) total = 0;

    // Sin `@state`: el cuaderno de esta clase. No entra en el snapshot, no escribe un cambio y no
    // le hace falta un autor, que es lo que lo hace útil desde un método privado.
    catalogue: string[] = [];

    /** Mira el catálogo. */
    @tool()
    look(): void {
      this.catalogue = ["brocha"];
      this.total = 4;
    }
  }

  it("keeps the declared fields and leaves an undeclared one out of the state", async () => {
    const agent = seal(new Declarada());

    await agent.look();

    expect(Object.keys(snapshot(agent)).sort()).toEqual(["customer", "stage", "total"]);
    expect(agent.catalogue).toEqual(["brocha"]);
    expect(changes(agent).map((change) => change.field)).toEqual(["total"]);
  });

  it("lets a scratch field be written with nobody running, which state itself never allows", () => {
    const agent = seal(new Declarada());

    expect(() => (agent.catalogue = ["martillo"])).not.toThrow();
    expect(() => (agent.stage = "cart")).toThrow(UnauthoredWrite);
  });

  it("reads pii: true as the visibility it is sugar for, and says nothing about a bare one", () => {
    expect(visibilityOf(Declarada)).toEqual([
      { name: "customer", visibility: "pii" },
      { name: "total", visibility: "public" },
    ]);
  });

  it("refuses pii: true beside a different visibility, naming the field", () => {
    expect(() => {
      class Contradictoria extends Agent {
        @state({ pii: true, visibility: "public" }) customer?: string;
      }
      return Contradictoria;
    }).toThrow(
      '@state({ pii: true, visibility: "public" }) on Contradictoria.customer: ' +
        "two different answers to one question; write one",
    );
  });

  it("keeps every own field for a class that declares none, as it always did", () => {
    /** Una clase que no decora nada. */
    class SinDecorar extends Agent {
      language = "es";
      stage = "browse";
      catalogue: string[] = [];
    }

    expect(Object.keys(snapshot(seal(new SinDecorar()))).sort()).toEqual(["catalogue", "stage"]);
  });
});
