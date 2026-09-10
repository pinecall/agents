// Every tag a view is written in renders its own text, and nothing else ever appears in a block.

import { describe, expect, it } from "vitest";

import { Example, Protocols, Prompt, Rule, Rules, Section } from "../../src/views/components.js";
import { renderToText } from "../../src/views/jsx-runtime.js";

describe("the components", () => {
  it("renders a prompt as its paragraphs", () => {
    const text = renderToText(
      <Prompt>
        <p>Uno.</p>
        <p>Dos.</p>
      </Prompt>,
    );
    expect(text).toBe("Uno.\n\nDos.");
  });

  it("renders every rule as a bullet inside the rules block", () => {
    const text = renderToText(
      <Rules>
        <Rule>No inventes horas.</Rule>
        <Rule>Una pregunta por turno.</Rule>
      </Rules>,
    );
    expect(text).toBe("<rules>\n- No inventes horas.\n- Una pregunta por turno.\n</rules>");
  });

  it("wraps the protocols in their own block", () => {
    expect(renderToText(<Protocols><Rule>Confirma antes de reservar.</Rule></Protocols>)).toBe(
      "<protocols>\n- Confirma antes de reservar.\n</protocols>",
    );
  });

  it("titles a section with its heading, and is only its body without one", () => {
    expect(renderToText(<Section title="Tarifas"><p>Cuarenta euros.</p></Section>)).toBe(
      "## Tarifas\n\nCuarenta euros.",
    );
    expect(renderToText(<Section><p>Cuarenta euros.</p></Section>)).toBe("Cuarenta euros.");
  });

  it("wraps an example so the model reads it as an example", () => {
    expect(renderToText(<Example><p>— Hola.</p></Example>)).toBe("<example>\n— Hola.\n</example>");
  });
});
