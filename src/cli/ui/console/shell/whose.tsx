/** Whose console this is: the person, or the org, on the key this tab holds, read once. */

import { useEffect, useState, type ReactNode } from "react";
import { z } from "zod";

import { read } from "../lib/api";
import { useCredentials } from "../lib/credentials";

// What `pinecall whoami` prints and the door answers: never the key itself, never its hash. The
// name is the person's when the key is a person's; the label or the org otherwise.
const WhoseSchema = z.object({
  org: z.string(),
  key_id: z.string(),
  label: z.string().nullish(),
  env: z.string().optional(),
  name: z.string().nullish(),
});

/**
 * The header's right-hand end. A person looking at a screen of calls should be able to see whose
 * console it is and which world it opens without grepping for anything — the question `whoami`
 * was written to answer.
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
  const who = whose.name ?? whose.label ?? whose.org;
  return (
    <span className="head-whose fixed" title={`key ${whose.key_id} · ${whose.org}`}>
      {whose.env === undefined ? who : `${who} · ${whose.env}`}
    </span>
  );
}
