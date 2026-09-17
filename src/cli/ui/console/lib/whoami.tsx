/** Whose console this is, read once per key: the org, the person, the world, and what the key opens. */

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { z } from "zod";

import { read } from "../../shared/api";
import { useCredentials } from "../../shared/credentials";

// What `pinecall whoami` prints and the door answers: never the key itself, never its hash.
const WhoseSchema = z.object({
  org: z.string(),
  /** The word a person types and reads — `clinica` — as against `org`, which is the id every door
   * takes. They differ on an org the box made, and that is the case this field exists for. */
  slug: z.string().nullish(),
  key_id: z.string(),
  label: z.string().nullish(),
  env: z.enum(["production", "sandbox"]),
  scopes: z.array(z.string()),
  subject: z.string().nullish(),
  name: z.string().nullish(),
  /** This person runs the box. */
  operator: z.boolean().optional(),
  /** They are inside an org they are not a member of, as the box's operator. */
  visiting: z.boolean().optional(),
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

/**
 * Whose org this is, in the word its people use.
 *
 * `org` is the id every door takes — `org_98889a61509c` on an org the box made — and a header
 * that shows THAT shows a person nothing. The id is said only when there is no slug: a gateway
 * too old to carry one, or an org whose row is gone. `pinecall whoami` reads it the same way.
 */
export function orgOf(whose: Whose): string {
  return whose.slug ?? whose.org;
}

/** What the key opens: every scope until the door answers, so nothing flickers off and on. */
export function useScopes(): readonly string[] | null {
  return useWhoami()?.scopes ?? null;
}
