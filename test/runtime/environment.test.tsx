// What a class declares of its environment reaches agent.configure, and wins over the settings there.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, expect, it } from "vitest";
import { Pinecall } from "../../src/client/index.js";
import { FakeGateway } from "../../src/client/testing/index.js";
import { DeclarationRefused } from "../../src/agent/tools.js";
import { llm, stt, voice } from "../../src/agent/decorators.js";
import ClinicaNorte from "../agent/clinica-norte.js";
import { ENVIRONMENT, declaredOnTheInstance, environmentOf } from "../../src/runtime/environment.js";
import { mount, optionsFor } from "../../src/runtime/connect.js";

const KEY = "pk_test";
const FILE = fileURLToPath(new URL("../agent/clinica-norte.tsx", import.meta.url));
const SOURCE = readFileSync(FILE, "utf8");

let gateway: FakeGateway;
let pc: Pinecall;

beforeEach(async () => {
  gateway = await FakeGateway.start({ apiKey: KEY });
  pc = new Pinecall({ url: gateway.url, apiKey: KEY });
  pc.onErrors(() => {});
});

afterEach(async () => {
  pc.close();
  await gateway.close();
});

/** Recepción que fija su voz, su modelo, sus oídos, su idioma y cómo abre. */
@voice("cartesia", "a0e99841-438c-4a64-b679-ae501e7d6091", { model: "sonic-2" })
@llm("openai/gpt-5.4-mini", { builds: "responses.LLM", options: { use_websocket: true } })
@stt("deepgram")
class Fijada extends ClinicaNorte {
  static override language = "es";
  static override greeting = { say: "Clínica Norte, buenas." };
  static override says = [{ word: "GSA", spoken: "G S A" }];
}

it("sends what the class declares, the plugin's options under their own names", async () => {
  mount(Fijada, { pc, source: SOURCE, file: FILE, slug: "fijada" });
  await pc.connect();
  for (let turn = 0; turn < 20; turn++) await new Promise((resolve) => setTimeout(resolve, 1));
  const config = gateway.commandsOf("agent.configure")[0]?.data["config"] as Record<string, unknown>;
  expect(config["voice"]).toEqual({
    provider: "cartesia",
    voice_id: "a0e99841-438c-4a64-b679-ae501e7d6091",
    model: "sonic-2",
  });
  expect(config["llm"]).toEqual({
    provider: "openai",
    model: "gpt-5.4-mini",
    builds: "responses.LLM",
    options: { use_websocket: true },
  });
  expect(config["stt"]).toEqual({ provider: "deepgram", model: "" });
  expect(config["language"]).toBe("es");
  expect(config["greeting"]).toEqual({ say: "Clínica Norte, buenas." });
  expect(config["says"]).toEqual([{ word: "GSA", spoken: "G S A" }]);
  expect(config["memory"]).toBeUndefined();
});

it("sends none of the environment for a class that declares none", () => {
  expect(environmentOf(ClinicaNorte)).toEqual({});
  const options = optionsFor(ClinicaNorte, [], new ClinicaNorte(), FILE) as Record<string, unknown>;
  for (const field of ENVIRONMENT) expect(options[field]).toBeUndefined();
});

it("keeps every slash of a model id after the vendor's", () => {
  @llm("livekit/openai/gpt-5-mini")
  class PorInferencia extends ClinicaNorte {}
  expect(environmentOf(PorInferencia).llm).toEqual({ provider: "livekit", model: "openai/gpt-5-mini" });
});

it("refuses a class that declares a model twice, by decorator and static field", () => {
  expect(() => {
    @llm("openai/gpt-5.4-mini")
    class DosVeces extends ClinicaNorte {
      static override llm = { provider: "anthropic", model: "claude-haiku-5-5" };
    }
    return DosVeces;
  }).toThrow(new DeclarationRefused("DosVeces declares both @llm(…) and a static llm; keep one"));
});

it("refuses an environment field on the instance, where it would be the call's state", () => {
  /** Recepción que dice su idioma como estado. */
  class EnEspanol extends ClinicaNorte {
    language = "es";
  }
  expect(() => optionsFor(EnEspanol, [], new EnEspanol(), FILE)).toThrow(
    "`language` is the class's, not a call's state: declare it as static language = …",
  );
  expect(declaredOnTheInstance("voice")).toContain("@voice('<vendor>', '<voice id>')");
});
