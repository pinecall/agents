// Every tag a view is written in renders its own text, and the placeholders render their marker.

import { describe, expect, it } from "vitest";

import {
  Example,
  Knowledge,
  Memory,
  Protocols,
  Prompt,
  Retrieved,
  Rule,
  Rules,
  withFills,
} from "../../src/views/components.js";
import { renderToText } from "../../src/views/jsx-runtime.js";

// The id a placeholder wrote into its marker, read back out of the marker's JSON payload.
function fillIn(text: string): string {
  return JSON.parse(text.slice("<!-- memory: ".length, -" -->".length))["fill"] as string;
}

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

  it("renders knowledge as a marker and never opens the file", () => {
    expect(renderToText(<Knowledge file="./knowledge/clinica.md" />)).toBe(
      "<!-- knowledge: ./knowledge/clinica.md -->",
    );
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

  it("wraps an example so the model reads it as an example", () => {
    expect(renderToText(<Example><p>— Hola.</p></Example>)).toBe("<example>\n— Hola.\n</example>");
  });

  it("renders memory as a marker carrying its props", () => {
    expect(renderToText(<Memory kinds={["preference"]} limit={3} />)).toBe(
      '<!-- memory: {"kinds":["preference"],"limit":3} -->',
    );
  });

  // The payload is read by the runtime, never by JavaScript: the view writes `minScore` and the
  // marker carries the wire's `min_score`.
  it("renders retrieved as a marker carrying its props, in the wire's own keys", () => {
    expect(renderToText(<Retrieved k={5} minScore={0.4} />)).toBe(
      '<!-- retrieved: {"k":5,"min_score":0.4} -->',
    );
  });

  it("keeps the render prop of a memory block and fills it later", () => {
    const render = withFills(() =>
      renderToText(
        <Memory kinds={["health"]}>{(facts: unknown) => <p>Recuerda: {String(facts)}</p>}</Memory>,
      ),
    );
    const id = fillIn(render.rendered);
    expect(render.fills.has(id)).toBe(true);
    expect(render.fills.fill(id, "alergia a la penicilina")).toBe("Recuerda: alergia a la penicilina");
  });

  it("gives each render its own registry, so two renders never fill each other's props", () => {
    const one = withFills(() =>
      renderToText(<Memory>{(facts: unknown) => <p>Uno: {String(facts)}</p>}</Memory>),
    );
    const other = withFills(() =>
      renderToText(<Memory>{(facts: unknown) => <p>Dos: {String(facts)}</p>}</Memory>),
    );
    // The ids collide on purpose: each render numbers from one, which is what makes them its own.
    expect(fillIn(one.rendered)).toBe(fillIn(other.rendered));
    expect(one.fills.fill(fillIn(one.rendered), "x")).toBe("Uno: x");
    expect(other.fills.fill(fillIn(other.rendered), "x")).toBe("Dos: x");
    expect(one.fills.has("fill-2")).toBe(false);
  });

  it("refuses a render prop written outside a render, instead of dropping it", () => {
    expect(() => renderToText(<Memory>{() => <p>nada</p>}</Memory>)).toThrow(/outside a render/);
  });
});
