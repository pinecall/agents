/** PROMPT: which blocks the app has written on this call, how each stands, and what the call has cost so far. */

import type { Cost, PromptState } from "@pinecall/protocol";
import type { ReactNode } from "react";

import { euros } from "../../lib/format";
import { KV, SectionLabel } from "../../ui";

export function PromptPanel({ prompt, cost }: { prompt: PromptState; cost: Cost | null }): ReactNode {
  const blocks = Object.entries(prompt);
  return (
    <>
      <SectionLabel ruled>Prompt</SectionLabel>
      <div className="lv-pane-body lv-pane-body-tight">
        {blocks.length === 0 && <div className="lv-sub">The app has written no block yet.</div>}
        {blocks.map(([name, block]) => (
          <div key={name} className="lv-prompt-row">
            <span className="lv-prompt-name">{name}</span>
            <span className="lv-prompt-hash" title={block.hash}>
              {block.hash.slice(0, 8)}
            </span>
            <span className="lv-prompt-chars">{block.chars.toLocaleString("en").replace(/,/g, " ")} chars</span>
          </div>
        ))}
        {cost !== null && <KV label="cost so far">{euros(cost.eur)}</KV>}
      </div>
    </>
  );
}
