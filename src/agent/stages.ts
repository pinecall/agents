/** `stage`: the readable spelling of a tool that is only there while the state says so. */

import type { Snapshot } from "./state.js";
import type { ToolOptions } from "./tools.js";

/**
 * The stages an agent moves through, written once as the type of its own field:
 * `stage: Stages<"identify" | "choose" | "book" | "done"> = "identify"`. It stays a plain state
 * field — the alias is there so the class and every `@tool({ stage })` name the same four words.
 */
export type Stages<Named extends string> = Named;

/**
 * The stage names a tool of this class may name: the union its `stage` field declares. A class
 * without one gives `never`, so `@tool({ stage: "book" })` on it is a compile error and
 * `@tool({ stage: "bok" })` on the clinic is another.
 */
export type StageOf<T> = T extends { stage: infer Named extends string } ? Named : never;

/** The stages one declaration names, always as a list: `"book"` and `["choose", "book"]` read alike. */
export function stagesOf(options: { stage?: unknown }): string[] | undefined {
  const declared = options.stage;
  if (declared === undefined) return undefined;
  return Array.isArray(declared) ? declared.map(String) : [String(declared)];
}

/** The stage this agent is in right now, or undefined for a class that names no stages. */
export function stageOf(agent: object): string | undefined {
  const named = (agent as { stage?: unknown }).stage;
  return typeof named === "string" ? named : undefined;
}

/**
 * Lower `stage` to the one visibility there is, at declaration time. `when(state)` stays the only
 * question ever asked of the state; a declaration that writes both is visible where both hold.
 */
export function lowerStage<T extends object>(options: ToolOptions<T>): ToolOptions<T> {
  const stages = stagesOf(options);
  if (stages === undefined) return options;
  const also = options.when;
  const inOneOfThem = (state: Snapshot<T>): boolean => {
    const named = (state as { stage?: unknown }).stage;
    return typeof named === "string" && stages.includes(named);
  };
  return {
    ...options,
    when: also === undefined ? inOneOfThem : (state) => inOneOfThem(state) && also(state),
  };
}
