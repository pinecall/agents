/** What `pinecall run` says beside a class that still declares what the world now owns: the world wins. */

import type { LexiconAnswer, LexiconRow, TuningAnswer, TuningRow } from "@pinecall/protocol";

import type { AgentOptions } from "../client/index.js";
import { readSettings } from "./agent-lines.js";
import { asked, type Door } from "./testing/gateway.js";

// One line per field the class declares differently from what the corner reads. The world wins —
// the session is built from the row, never from the class — so the line says what to delete. A
// class that declares nothing of the environment, or declares exactly what the world says
// (the world was seeded from it), prints nothing at all.
export async function worldsWord(door: Door, slug: string, options: AgentOptions): Promise<string[]> {
  let settings: TuningAnswer;
  let lexicon: LexiconAnswer | null = null;
  try {
    settings = await readSettings(door, slug);
    lexicon = await asked<LexiconAnswer>(door, "/v1/lexicon");
  } catch {
    // A key that opens neither `pipeline` nor `words` — the box's app key — is not told: what it
    // runs is resolved by the gateway either way, and a refusal here is not the run's to print.
    return [];
  }
  const row = settings.yours ?? settings.team;
  const where = settings.yours !== null ? "your corner" : settings.world === "production" ? "production" : "the team's sandbox";
  return differences(options, row, lexicon.yours ?? lexicon.team, where);
}

/** The lines, as a pure function of what the class declared and what the corner reads. */
export function differences(options: AgentOptions, row: TuningRow | null, words: LexiconRow | null, where: string): string[] {
  const said: string[] = [];
  const config = row?.config;
  const differs = (field: string, declared: string | undefined, set: string | undefined): void => {
    if (declared === undefined || set === undefined || declared === set) return;
    said.push(`class says ${field} ${declared}, ${where} says ${set}: the world wins — remove ${field} from the class`);
  };
  if (config !== undefined) {
    differs("voice", options.voice?.name ?? undefined, config.voice ?? undefined);
    differs("llm", modelWord(options.llm), config.llm ?? undefined);
    differs("stt", modelWord(options.stt), config.stt ?? undefined);
    differs("greeting", opening(options.greeting), opening(config.greeting));
    differs("hangup", options.hangup?.when ?? undefined, config.hangup?.when ?? undefined);
    const declaredMemory = options.memory ?? undefined;
    const setMemory = config.memory ?? undefined;
    differs(
      "memory",
      declaredMemory === undefined ? undefined : JSON.stringify([declaredMemory.remember ?? [], declaredMemory.forget ?? []]),
      setMemory === undefined ? undefined : JSON.stringify([setMemory.remember ?? [], setMemory.forget ?? []]),
    );
    differs("docs", options.docs?.base ?? undefined, config.knowledge?.[0]?.base);
  }
  if (words !== null) {
    for (const one of options.says ?? []) {
      const spoken = words.lexicon.said.find((kept) => kept.word === one.word)?.spoken;
      if (spoken !== undefined && spoken !== one.spoken) {
        said.push(`class says ${one.word} → "${one.spoken}", the lexicon says "${spoken}": the world wins — remove it from says`);
      }
    }
  }
  return said;
}

/** An opening as one comparable word: the words in quotes, or the instruction. */
function opening(greeting: { say?: string | null | undefined; reply?: string | null | undefined } | null | undefined): string | undefined {
  if (greeting === undefined || greeting === null) return undefined;
  const say = greeting.say ?? undefined;
  return say !== undefined ? `"${say}"` : `reply: ${greeting.reply ?? ""}`;
}

function modelWord(model: { provider: string; model: string } | null | undefined): string | undefined {
  if (model === undefined || model === null) return undefined;
  return model.model === "" ? model.provider : `${model.provider}/${model.model}`;
}
