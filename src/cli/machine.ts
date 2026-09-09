/** The machine a developer is writing, on one page: the stage the agent is in, and what it shows. */

import { stageOf, stagesOf } from "../agent/stages.js";
import { toolsOf, visibleToolsOf, type ErasedToolOptions } from "../agent/tools.js";
import { headerFor } from "../views/render.js";

/**
 * Every tool the class declares, the visible ones filled in, each with what gates it. The model
 * never reads this — it only ever sees the filled ones — but the person writing the class does,
 * and the page is what turns "why is book not there" into a glance.
 */
export function showMachine(agent: object): string {
  const visible = new Set(visibleToolsOf(agent).map((declared) => declared.name));
  const declarations = toolsOf(agent);
  if (declarations.length === 0) return `${header(agent)}\n\n  this agent declares no tools`;
  const width = Math.max(...declarations.map((declared) => declared.name.length));
  const lines = declarations.map((declared) => {
    const shown = visible.has(declared.name);
    const mark = shown ? "●" : "○";
    return `  ${mark} ${declared.name.padEnd(width)}  ${gatedBy(agent, declared.options, shown)}`;
  });
  return [header(agent), "", ...lines].join("\n");
}

// The stage rides in the header, beside the tools it decides: a class with no stages says nothing
// there rather than inventing one.
function header(agent: object): string {
  const stage = stageOf(agent);
  return stage === undefined ? headerFor("tools") : `${headerFor("tools")} stage: ${stage}`;
}

// What decides this tool, in the words its declaration used: the stages it named, `when(state)` for
// a predicate, `always` for a tool nothing gates. A staged tool that its own stage does not bring
// back is the one question this page exists to answer, so it says who said no.
function gatedBy(agent: object, options: ErasedToolOptions, shown: boolean): string {
  const stages = stagesOf(options);
  if (stages === undefined) return options.when === undefined ? "always" : "when(state)";
  const here = stageOf(agent);
  const named = stages.join(" · ");
  const hiddenInItsOwnStage = !shown && here !== undefined && stages.includes(here);
  return hiddenInItsOwnStage ? `${named} · when(state) says no` : named;
}
