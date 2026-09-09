/** PROMPT: which blocks the app has written on this call, and how each stands, beside the state. */

import type { PromptState } from "@pinecall/protocol";
import type { ReactNode } from "react";

import { PromptBlocks } from "./prompt-blocks";

export function PromptPanel({ prompt }: { prompt: PromptState }): ReactNode {
  return (
    <section className="live-panel">
      <h3 className="live-panel-name">PROMPT</h3>
      {Object.keys(prompt).length === 0 ? (
        <p className="live-panel-empty">The app has written no block yet.</p>
      ) : (
        <PromptBlocks prompt={prompt} />
      )}
    </section>
  );
}
