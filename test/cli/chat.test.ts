// `pinecall chat`: the caller socket it opens, and which process that socket asks to be served by.

import { describe, expect, it } from "vitest";

import { chatUrl, group, lineOf } from "../../src/cli/chat.js";

describe("the caller socket chat opens", () => {
  it("flips the scheme and names the agent on the gateway's own host", () => {
    expect(chatUrl("http://127.0.0.1:8080", "clinica-norte")).toBe(
      "ws://127.0.0.1:8080/v1/chat?agent=clinica-norte",
    );
  });

  it("keeps a path the gateway is proxied under, and goes wss over https", () => {
    expect(chatUrl("https://voice.pinecall.io/pc/", "tienda-sur")).toBe(
      "wss://voice.pinecall.io/pc/v1/chat?agent=tienda-sur",
    );
  });

  // The whole point of the verb: with a `pinecall run` running, the newest socket holding the
  // agent is that server's, so a chat that named nobody would run its tools over there.
  it("asks to be served by this process's own app socket when it has one", () => {
    expect(chatUrl("http://127.0.0.1:8080", "clinica-norte", "app_7c1e")).toBe(
      "ws://127.0.0.1:8080/v1/chat?agent=clinica-norte&app=app_7c1e",
    );
  });

  it("says in one line that the app runs here", () => {
    expect(group.purpose).toContain("own process");
  });
});

// The verb prints the conversation and what the tenant's code did in it: the four marks view.ts
// owns, plus an error in its own words. Everything else is machinery and lives behind --events.
describe("what one entry off the socket prints", () => {
  const frame = (type: string, data: Record<string, unknown>): string => JSON.stringify({ type, data });

  it("gives the conversation its four marks", () => {
    expect(lineOf(frame("turn.agent", { text: "¿Cuál es su nombre?" }))).toBe("› ¿Cuál es su nombre?");
    expect(lineOf(frame("tool.call", { name: "findPatient", arguments: { phone: "600000001" } }))).toBe(
      '→ findPatient({"phone":"600000001"})',
    );
    expect(lineOf(frame("tool.result", { name: "findPatient", summary: "Ana García" }))).toBe(
      "← findPatient Ana García",
    );
  });

  it("has no line at all for the machinery around it", () => {
    for (const type of ["call.started", "state.changed", "prompt.changed", "tools.changed", "agent.state", "metrics.llm"]) {
      expect(lineOf(frame(type, {}))).toBeNull();
    }
  });

  // A tool that threw is the thing a person most needs to read, and it used to print as the bare
  // word "error" — five characters where the sentence was.
  it("says what an error was in the words it carries", () => {
    expect(lineOf(frame("error", { code: "tool_timeout", message: "findPatient took longer than 10s" }))).toBe(
      "✗ findPatient took longer than 10s",
    );
  });

  it("leaves the caller's own sentence to the prompt that already echoed it", () => {
    expect(lineOf(frame("turn.user", { text: "hola" }))).toBeNull();
  });
});
