/** The verdict each finished call was sealed with, read once per call, for whichever list holds the lines. */

import type { CallScore, SessionLine } from "@pinecall/protocol";
import { useEffect, useRef, useState } from "react";

import type { Credentials } from "../../shared/api";
import { useCredentials } from "../../shared/credentials";
import { readScore } from "./score";
import { isLive } from "./use-agent-sessions";

// A screenful. The sessions doors answer a screenful and this reads the tail of each call, so the
// number is what a person scrolls rather than what the store holds.
const A_SCREENFUL = 20;

/** One finished call and what the judges said about it, or why the entry could not be read. */
export interface Scored {
  line: SessionLine;
  // False until the log has been asked. A verdict of null on a call nobody has read yet is not the
  // same fact as a call whose log carries no `call.score`, and the screen says the two differently.
  read: boolean;
  score: CallScore | null;
  refused: string | null;
}

// A call that is over is over: its verdict is written and will not change, so it is read once and
// kept in a ref, published as a copy on each answer. The list itself keeps changing — a call that
// ends while somebody watches joins the rows on the next tick and is read then.
/** The finished calls among these lines, each with the `call.score` its log seals on. */
export function useScores(lines: SessionLine[]): Scored[] {
  const credentials = useCredentials();
  const held = useRef<Map<string, Scored>>(new Map());
  const [scored, setScored] = useState<ReadonlyMap<string, Scored>>(held.current);
  const ended = lines.filter((line) => !isLive(line)).slice(0, A_SCREENFUL);
  // The calls that ENDED are what this reads. The list itself is a new array every few seconds,
  // and re-reading on its identity would ask the gateway for a sealed entry twenty times a minute.
  const wanted = ended.map((line) => `${line.call}@${line.last_seq}`).join(" ");

  useEffect(() => {
    let stopped = false;
    const unread = ended.filter((line) => !held.current.has(line.call));

    void (async () => {
      const rows = await Promise.all(unread.map((line) => scoreOf(credentials, line)));
      if (stopped || rows.length === 0) {
        return;
      }
      for (const row of rows) {
        held.current.set(row.line.call, row);
      }
      setScored(new Map(held.current));
    })();

    return () => {
      stopped = true;
    };
  }, [wanted, credentials]);

  return ended.map((line) => scored.get(line.call) ?? unread(line));
}

// The reason one call has no verdict belongs on that call's row and never in the screen's one error
// line: a store that lost an entry must not make the other nineteen unreadable.
/** One call's sealing entry, or the sentence the door refused it with. */
async function scoreOf(credentials: Credentials, line: SessionLine): Promise<Scored> {
  try {
    const score = await readScore(credentials, line.call, line.last_seq);
    return { line, read: true, score, refused: null };
  } catch (refused) {
    return { line, read: true, score: null, refused: String(refused) };
  }
}

/** A call whose entry has not been read back yet: no verdict, and no claim that there is none. */
function unread(line: SessionLine): Scored {
  return { line, read: false, score: null, refused: null };
}
