/** Whose gateway this is: the org on the key the CLI in front of this page signs with, read once. */

import { useEffect, useState, type ReactNode } from "react";
import { z } from "zod";

import { read } from "../lib/api";
import { useCredentials } from "../lib/credentials";

// The three words `pinecall whoami` prints, and the three the door answers: never the key itself,
// never its hash. Which of the four places the key came from is the terminal's line, not this one.
const WhoseSchema = z.object({ org: z.string(), key_id: z.string(), label: z.string().nullish() });

/**
 * The header's right-hand end. A console served by one terminal is pointed at exactly one gateway
 * with exactly one key, and a person looking at a screen of calls should be able to see whose
 * without grepping for an exported name — the question `whoami` was written to answer.
 */
export function Whose(): ReactNode {
  const credentials = useCredentials();
  const [whose, setWhose] = useState<z.infer<typeof WhoseSchema> | null>(null);

  useEffect(() => {
    let gone = false;
    read(credentials, "/v1/whoami").then(
      (answer) => {
        if (!gone) setWhose(WhoseSchema.parse(answer));
      },
      () => undefined,
    );
    return () => {
      gone = true;
    };
  }, [credentials]);

  if (whose === null) return null;
  return (
    <span className="head-whose fixed" title={`key ${whose.key_id}`}>
      {whose.label ?? whose.org}
    </span>
  );
}
