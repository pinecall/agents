// The sentence `pinecall line` and `pinecall run` both print: where a ring lands, and the move
// that changes it. A member id is never in it — a person recognises a colleague by their email.

import { describe, expect, it } from "vitest";

import { describing } from "../../src/cli/line.js";
import { rings } from "../../src/cli/run.js";
import type { TheLine } from "@pinecall/protocol";

const AGENT = "tienda-sur";

function said(over: Partial<TheLine> = {}): TheLine {
  return { agent: AGENT, env: "development", held: true, yours: true, waiting: [], ...over };
}

const BERNA = { holder: "m_berna", name: "berna@clinica.test" };
const CARLA = { holder: "m_carla", name: "carla@clinica.test" };

describe("the line, as a person reads it", () => {
  it("says the ring lands here, and nothing else, for the one developer running the agent", () => {
    expect(describing(said({ holding: BERNA }))).toBe("rings in this terminal");
  });

  it("names who else is running it, so the person holding it knows they are not alone", () => {
    const line = said({ holding: BERNA, waiting: [CARLA] });

    expect(describing(line)).toBe("rings in this terminal · also running: carla@clinica.test");
  });

  it("names whose terminal it rings in, and the move that takes it", () => {
    const line = said({ yours: false, holding: BERNA, waiting: [CARLA] });

    expect(describing(line)).toBe("rings in berna@clinica.test · `pinecall line claim` takes it");
  });

  it("never prints a member id, which names nobody a person could recognise", () => {
    expect(describing(said({ yours: false, holding: BERNA }))).not.toContain("m_berna");
  });

  it("says a corner nobody is named in as what it is, rather than as a null", () => {
    const line = said({ yours: false, holding: { holder: null, name: null } });

    expect(describing(line)).toContain("the terminal running the org's own key");
  });

  it("says what to start when nobody is answering it at all", () => {
    expect(describing(said({ held: false }))).toBe(`nobody is answering ${AGENT}: start \`pinecall run\``);
  });
});

describe("whether an agent has a ring to land anywhere", () => {
  it("is true of an agent that answers at a number", () => {
    expect(rings([{ channel: "phone", number: "+59829001199" }])).toBe(true);
  });

  it("is false of one that only answers a widget, so `run` says nothing about a line", () => {
    expect(rings([{ channel: "web" }])).toBe(false);
    expect(rings(undefined)).toBe(false);
  });
});
