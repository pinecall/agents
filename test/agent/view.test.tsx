// A class draws one panel, names it, and says so in the declaration the gateway is sent.

import { describe, expect, it } from "vitest";

import { Agent } from "../../src/agent/agent.js";
import { DeclarationRefused } from "../../src/agent/tools.js";
import { view, viewOf, type Who } from "../../src/agent/view.js";
import { optionsFor } from "../../src/runtime/connect.js";
import { Panel, Row } from "../../src/views/panels.js";

function CustomerCard(who: Who): ReturnType<typeof Panel> {
  return (
    <Panel title="Cliente">
      <Row label="Teléfono">{who.contact}</Row>
    </Panel>
  );
}

describe("@view", () => {
  it("names the panel after the function that draws it", () => {
    @view(CustomerCard)
    class Maravilla extends Agent {
      web = true;
    }
    expect(viewOf(Maravilla)?.name).toBe("Customer Card");
  });

  it("takes the name the business calls it by", () => {
    @view(CustomerCard, "Cliente")
    class Maravilla extends Agent {
      web = true;
    }
    expect(viewOf(Maravilla)?.name).toBe("Cliente");
  });

  it("refuses a class that declares two, because a class draws one panel", () => {
    expect(() => {
      @view(CustomerCard, "Cliente")
      @view(CustomerCard, "Pedido")
      class Maravilla extends Agent {
        web = true;
      }
      return Maravilla;
    }).toThrow(DeclarationRefused);
  });

  it("declares only the panel's NAME to the gateway: what it holds is asked for per conversation", () => {
    @view(CustomerCard, "Cliente")
    class Maravilla extends Agent {
      web = true;
    }
    expect(optionsFor(Maravilla, []).view).toEqual({ name: "Cliente" });
  });

  it("says nothing at all for a class that draws no panel", () => {
    class Sencilla extends Agent {
      web = true;
    }
    expect(viewOf(Sencilla)).toBeUndefined();
    expect(optionsFor(Sencilla, []).view).toBeUndefined();
  });
});
