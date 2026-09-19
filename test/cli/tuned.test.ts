// What `pinecall run` prints beside a class that still declares what the world now owns: one line
// per field the corner says differently, and nothing when they agree or the class says nothing.

import { describe, expect, it } from "vitest";

import { differences } from "../../src/cli/tuned.js";

const ROW = {
  holder: "",
  version: 11,
  author: "m_bruno",
  note: null,
  set_at: 1758300000,
  config: { voice: "carolina", llm: "anthropic/claude-haiku-4-5", greeting: { say: "Buenas." }, hangup: { when: "bye" } },
};
const WORDS = { holder: "", version: 2, author: "m_carla", note: null, set_at: 1, lexicon: { said: [{ word: "GSA", spoken: "G S A" }], heard: [] } };

describe("the world wins", () => {
  it("names every field the class declares differently, and what to remove", () => {
    const said = differences(
      { voice: { name: "sofia" }, llm: { provider: "anthropic", model: "claude-sonnet-4-5" }, greeting: { say: "Buenas." }, says: [{ word: "GSA", spoken: "ge ese a" }] },
      ROW,
      WORDS,
      "the team's sandbox",
    );

    expect(said).toEqual([
      "class says voice sofia, the team's sandbox says carolina: the world wins — remove voice from the class",
      "class says llm anthropic/claude-sonnet-4-5, the team's sandbox says anthropic/claude-haiku-4-5: the world wins — remove llm from the class",
      'class says GSA → "ge ese a", the lexicon says "G S A": the world wins — remove it from says',
    ]);
  });

  it("says nothing when the class agrees with the world, or declares nothing of it", () => {
    expect(differences({ voice: { name: "carolina" }, greeting: { say: "Buenas." } }, ROW, null, "your corner")).toEqual([]);
    expect(differences({ language: "es" }, ROW, WORDS, "your corner")).toEqual([]);
    expect(differences({ voice: { name: "sofia" } }, null, null, "your corner")).toEqual([]);
  });

  it("leaves a field the world never set to the class", () => {
    expect(differences({ stt: { provider: "deepgram", model: "" } }, ROW, null, "production")).toEqual([]);
  });
});
