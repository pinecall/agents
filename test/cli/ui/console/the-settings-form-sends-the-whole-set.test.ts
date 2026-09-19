// The Settings form is two lists over one wire word per stage, and it sends the whole set: what a
// corner set is what the form opens on, and what the form saves is what the corner will say.

import { describe, expect, it } from "vitest";

import { configOf, knobOf, typedOf, wordOf } from "../../../../src/cli/ui/console/screens/settings/typed";

const VENDORS = new Set(["anthropic", "deepgram", "elevenlabs", "cartesia"]);

describe("a model knob, read as two picks", () => {
  it("reads a vendor, a vendor with its model, and a bare model on the vendor in use", () => {
    expect(knobOf("deepgram", VENDORS)).toEqual({ vendor: "deepgram", model: "" });
    expect(knobOf("anthropic/claude-haiku-4-5", VENDORS)).toEqual({ vendor: "anthropic", model: "claude-haiku-4-5" });
    expect(knobOf("claude-sonnet-5", VENDORS)).toEqual({ vendor: "", model: "claude-sonnet-5" });
    expect(knobOf(null, VENDORS)).toEqual({ vendor: "", model: "" });
  });

  it("writes the same three forms back, and nothing when neither was picked", () => {
    expect(wordOf({ vendor: "deepgram", model: "" })).toBe("deepgram");
    expect(wordOf({ vendor: "anthropic", model: "claude-opus-5" })).toBe("anthropic/claude-opus-5");
    expect(wordOf({ vendor: "", model: "claude-sonnet-5" })).toBe("claude-sonnet-5");
    expect(wordOf({ vendor: "", model: "" })).toBe("");
  });
});

describe("the form opened on a corner", () => {
  it("folds tts_model into the speaking pick, since it wins on the wire", () => {
    const typed = typedOf({ tts: "elevenlabs", tts_model: "eleven_multilingual_v2", voice: "carolina" }, VENDORS);

    expect(typed.tts).toEqual({ vendor: "elevenlabs", model: "eleven_multilingual_v2" });
    expect(typed.voice).toBe("carolina");
  });

  it("opens on the instruction when the greeting is one, and on the words otherwise", () => {
    expect(typedOf({ greeting: { reply: "greet them" } }, VENDORS).opening).toBe("reply");
    expect(typedOf({ greeting: { say: "Buenos días." } }, VENDORS).opening).toBe("say");
    expect(typedOf({}, VENDORS).opening).toBe("say");
  });

  it("lists the bases as rows, with k when the corner set one", () => {
    expect(typedOf({ bases: [{ base: "clinica", k: 4 }, { base: "tarifas" }] }, VENDORS).bases).toEqual([
      { base: "clinica", k: "4" },
      { base: "tarifas", k: "" },
    ]);
  });
});

describe("what the form sends", () => {
  it("is the whole set, every pick as one wire word, and tts_model never", () => {
    const typed = typedOf({ tts_model: "eleven_multilingual_v2", memory: { remember: ["allergies"], forget: [] } }, VENDORS);
    typed.stt = { vendor: "deepgram", model: "nova-3" };
    typed.llm = { vendor: "", model: "" };
    typed.tts = { vendor: "elevenlabs", model: "eleven_v3_conversational" };
    typed.voice = "mateo";
    typed.say = "Clínica Norte, ¿en qué le ayudo?";
    typed.endpointing_ms = "900";
    typed.bases = [{ base: "clinica", k: "4" }];

    expect(configOf(typed, false, {})).toEqual({
      stt: "deepgram/nova-3",
      tts: "elevenlabs/eleven_v3_conversational",
      voice: "mateo",
      greeting: { say: "Clínica Norte, ¿en qué le ayudo?" },
      turn: { endpointing_ms: 900 },
      memory: { remember: ["allergies"], forget: [] },
      bases: [{ base: "clinica", k: 4 }],
    });
  });

  it("sends the instruction and not the words when the opening is the model's", () => {
    const typed = typedOf({}, VENDORS);
    typed.opening = "reply";
    typed.reply = "greet them and ask what they need";
    typed.say = "left over from before";

    expect(configOf(typed, false, {}).greeting).toEqual({ reply: "greet them and ask what they need" });
  });

  it("carries the corner's other fields over for a key that opens words alone", () => {
    const standing = { voice: "carolina", llm: "anthropic/claude-haiku-4-5", greeting: { say: "Buenas." }, bases: [{ base: "clinica", k: 4 }] };
    const typed = typedOf(standing, VENDORS);
    typed.say = "Clínica Norte, buenos días.";
    typed.knowledge = "# Horario\nDe 9 a 20.";
    typed.llm = { vendor: "", model: "" };

    expect(configOf(typed, true, standing)).toEqual({
      voice: "carolina",
      llm: "anthropic/claude-haiku-4-5",
      greeting: { say: "Clínica Norte, buenos días." },
      knowledge: "# Horario\nDe 9 a 20.",
      bases: [{ base: "clinica", k: 4 }],
    });
  });
});
