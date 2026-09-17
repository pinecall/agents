/** The blocks of the prompt as the log knows them: by name, each with its hash and its length, never its text. */

import type { PromptState } from "@pinecall/protocol";
import type { ReactNode } from "react";

import { KV } from "../../ui";

// The text stays out of the log by design (the runtime's docs/decisions/prompt-blocks.md): what a
// reader can do is tell two states apart, and see which block was rewritten and when.
/** One row per block the app has written on this call, in the order they were first written. */
export function PromptBlocks({ prompt }: { prompt: PromptState }): ReactNode {
  return (
    <div className="lv-readings">
      {Object.entries(prompt).map(([name, block]) => (
        <KV key={name} label={name}>
          {block.hash.slice(0, 16)} · {block.chars} chars · seq {block.seq}
        </KV>
      ))}
    </div>
  );
}
