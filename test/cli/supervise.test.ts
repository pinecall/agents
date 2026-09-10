/** `pinecall supervise`: what a typed line means, and what a person at the desk is shown. */

import { describe, expect, it } from "vitest";

import { lineOf, moveOf, run } from "../../src/cli/supervise.js";

// A stream that keeps what was written, so a test reads the CLI's output as a string.
function collected(): { stream: NodeJS.WritableStream; text(): string } {
  const written: string[] = [];
  const stream = { write: (chunk: string) => written.push(chunk) } as unknown as NodeJS.WritableStream;
  return { stream, text: () => written.join("") };
}

describe("what a typed line means", () => {
  it("reads the five moves the desk has", () => {
    expect(moveOf("t")).toEqual({ verb: "takeover" });
    expect(moveOf("x")).toEqual({ verb: "release" });
    expect(moveOf("w no le has dicho el precio")).toEqual({ verb: "whisper", text: "no le has dicho el precio" });
    expect(moveOf("s Le paso con recepción.")).toEqual({ verb: "say", text: "Le paso con recepción." });
    expect(moveOf("e el paciente colgó")).toEqual({ verb: "end", reason: "el paciente colgó" });
  });

  it("ends a call with no reason when nobody gave one", () => {
    expect(moveOf("e")).toEqual({ verb: "end", reason: undefined });
  });

  it("keeps the whole sentence, spaces and all, and not just the first word", () => {
    expect(moveOf("w dile que la doctora Vidal no pasa consulta el jueves")).toEqual({
      verb: "whisper",
      text: "dile que la doctora Vidal no pasa consulta el jueves",
    });
  });

  // A `w` with nothing after it is a person who pressed enter early, not a whisper of "".
  it("refuses a whisper and a say with nothing to said", () => {
    expect(moveOf("w")).toBeNull();
    expect(moveOf("s")).toBeNull();
  });

  it("q leaves the desk and is not a verb anybody is sent", () => {
    expect(moveOf("q")).toBe("leave");
  });

  it("says nothing at all about a line nobody meant", () => {
    expect(moveOf("hola")).toBeNull();
    expect(moveOf("")).toBeNull();
  });
});

describe("what the desk is shown", () => {
  it("prints both speakers with the seq the entry landed under", () => {
    expect(lineOf(12, "turn.user", { text: "¿Tenéis algo el martes?" })).toBe("  12  caller  ¿Tenéis algo el martes?");
    expect(lineOf(13, "turn.agent", { text: "Sí, a las nueve." })).toBe("  13  agent   Sí, a las nueve.");
  });

  it("prints every move a human made, by the name the log gave it", () => {
    expect(lineOf(20, "supervisor.whispered", { text: "el precio" })).toBe("  20  desk    whispered el precio");
    expect(lineOf(21, "supervisor.took_over", {})).toBe("  21  desk    took_over");
  });

  it("prints the end and why", () => {
    expect(lineOf(30, "call.ended", { reason: "agent_hung_up" })).toBe("  30  ——      ended: agent_hung_up");
  });

  // The desk is the conversation. A metric or a prompt change is in the log and not on this screen.
  it("prints nothing a supervisor cannot act on", () => {
    expect(lineOf(4, "metrics.llm", { ttft: 0.3 })).toBeNull();
    expect(lineOf(5, "prompt.changed", { name: "view" })).toBeNull();
  });
});

describe("the verb itself", () => {
  it("says what it needs when nobody named a call", async () => {
    const err = collected();

    expect(await run([], { err: err.stream, out: collected().stream })).toBe(2);
    expect(err.text()).toContain("usage: pinecall supervise <call>");
  });
});
