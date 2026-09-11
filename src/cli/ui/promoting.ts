/** The console's own door to `runs promote`: one real call written down as a golden candidate, here. */

import type { Golden } from "../testing/goldens.js";
import { Refused, type Door } from "../testing/gateway.js";
import { CANDIDATES, promotedTo } from "../runs/candidate.js";
import { anObject, aString, maybeNumber, someWords } from "./asked.js";
import { Refusal } from "./refusal.js";

/** What comes back: where the file landed, the golden itself, and what is still a person's to decide. */
export interface Promoted {
  path: string;
  candidate: Golden;
  notes: string[];
}

/** What the server needs from the promote door. */
export interface Promoting {
  /** Where candidates land in this directory, so the page can say it before anybody presses. */
  roster(): Promise<{ agent: string | null; out: string }>;
  promote(asked: unknown): Promise<Promoted>;
}

const NO_CLASS = "no agent class in this directory: a candidate is written beside the goldens it will join";

/**
 * One `Promoting` for the life of a `pinecall ui`. A promotion WRITES A FILE — `test/candidates`
 * beside this directory's goldens — which is why it is a door of this process and not of the
 * gateway: the call is the gateway's, the file is this machine's. It lands as a CANDIDATE with
 * `promoted_from` on it, and a person edits it before it counts as a golden.
 */
export function promotingFrom(door: Door, agent: string | null, out: NodeJS.WritableStream): Promoting {
  return {
    async roster(): Promise<{ agent: string | null; out: string }> {
      return { agent, out: CANDIDATES };
    },

    async promote(asked: unknown): Promise<Promoted> {
      if (agent === null) throw new Refusal(409, NO_CLASS);
      const given = anObject(asked, "a promotion");
      const call = aString(given, "call");
      const name = someWords(given, "name");
      try {
        const written = await promotedTo(door, call, {
          ...(name === undefined ? {} : { name }),
          out: CANDIDATES,
          fromSeq: maybeNumber(given, "from_seq", 0, Number.MAX_SAFE_INTEGER) ?? 0,
        });
        out.write(`${written.path}  promoted from ${call}\n`);
        return written;
      } catch (refused) {
        // The gateway refusing — another org's call, a door that is down — keeps its own status
        // and sentence (ui/refusal.ts). What is a 422 HERE is this door's own two: a call with no
        // log, and a call nobody judged, which has no verdict to write an `expect` from.
        if (refused instanceof Refused) throw refused;
        throw new Refusal(422, refused instanceof Error ? refused.message : String(refused));
      }
    },
  };
}
