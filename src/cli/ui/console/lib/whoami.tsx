/** Whose console this is, read once per key: the org, the person, the world, and what the key opens. */

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { z } from "zod";

import { read } from "../../shared/api";
import { useCredentials } from "../../shared/credentials";

// What `pinecall whoami` prints and the door answers: never the key itself, never its hash.
const WhoseSchema = z.object({
  org: z.string(),
  key_id: z.string(),
  label: z.string().nullish(),
  env: z.enum(["production", "sandbox"]),
  scopes: z.array(z.string()),
  subject: z.string().nullish(),
  name: z.string().nullish(),
});
export type Whose = z.infer<typeof WhoseSchema>;

const Held = createContext<Whose | null>(null);

/** Ask the door once for this key, and hand the answer to the whole tree: the rail gates by it. */
export function WhoamiProvider({ children }: { children: ReactNode }): ReactNode {
  const credentials = useCredentials();
  const [whose, setWhose] = useState<Whose | null>(null);

  useEffect(() => {
    let gone = false;
    setWhose(null);
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

  return <Held value={whose}>{children}</Held>;
}

/** Who this tab is, or null until the door has answered. */
export function useWhoami(): Whose | null {
  return useContext(Held);
}

/** What the key opens: every scope until the door answers, so nothing flickers off and on. */
export function useScopes(): readonly string[] | null {
  return useWhoami()?.scopes ?? null;
}
