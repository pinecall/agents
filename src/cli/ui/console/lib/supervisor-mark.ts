/** What a supervisor did to a call, as the one line every screen that reads the log draws it as. */

import { eventOf, type Entry, type Supervisor } from "@pinecall/protocol";

/** One supervisor's move, read: the sentence a person follows, and who made it. */
export interface SupervisorMark {
  said: string;
  by: string;
}

// The six entries a supervise verb writes (docs/protocol/events-control.md). A takeover is never a
// gap in the record, so it is never a row the reader has to unfold either: each one is a sentence.
const A_SUPERVISOR = "supervisor.";

/** The mark this entry is worth, or null when it is not one of a supervisor's six. */
export function supervisorMark(entry: Entry): SupervisorMark | null {
  if (!entry.type.startsWith(A_SUPERVISOR)) {
    return null;
  }
  const event = eventOf(entry);
  switch (event.type) {
    case "supervisor.whispered":
      return { said: `supervisor whispered: ${event.data.text}`, by: named(event.data.by) };
    case "supervisor.said":
      return { said: `supervisor made the agent say: ${event.data.text}`, by: named(event.data.by) };
    case "supervisor.took_over":
      return { said: "supervisor took the line", by: named(event.data.by) };
    case "supervisor.released":
      return { said: "supervisor handed the line back", by: named(event.data.by) };
    case "supervisor.transferred":
      return { said: `supervisor transferred the call to ${event.data.to}`, by: named(event.data.by) };
    case "supervisor.ended":
      return { said: `supervisor ended the call${because(event.data.reason)}`, by: named(event.data.by) };
    default:
      return null;
  }
}

// The token says who the desk was; a name is there only when whoever minted it gave one.
function named(by: Supervisor): string {
  return by.name ?? by.id;
}

function because(reason: string | null | undefined): string {
  return reason === null || reason === undefined ? "" : `: ${reason}`;
}
