/** What the agent declared about its state fields: who may see each one, read from its config. */

import { useEffect, useState } from "react";
import { z } from "zod";

import { read } from "../../shared/api";
import { useCredentials } from "../../shared/credentials";

// The three the runtime knows, in the runtime's types/agent.py and nowhere else on this
// side: a console that could spell a fourth would be a console deciding what one meant.
const VISIBILITIES = ["public", "tenant", "pii"] as const;

/** Who may see one state field. `tenant` is what an undeclared field is, by the domain's rule. */
export type Visibility = (typeof VISIBILITIES)[number];

// `GET /v1/agents/{slug}/config` answers the whole resolved declaration — the prompt, the tools,
// the models. This reads one field of it, so the shape says one field and lets the rest through.
const DeclarationSchema = z.object({
  state_fields: z.record(z.string(), z.enum(VISIBILITIES)).default({}),
});

/** What the agent said about each of its state fields. An agent that said nothing declares nothing. */
export function useDeclaredState(agent: string): Record<string, Visibility> {
  const credentials = useCredentials();
  const [declared, setDeclared] = useState<Record<string, Visibility>>({});

  useEffect(() => {
    let stopped = false;
    if (agent === "") {
      return;
    }
    void (async () => {
      try {
        const said = DeclarationSchema.parse(await read(credentials, `/v1/agents/${agent}/config`));
        if (!stopped) {
          setDeclared(said.state_fields);
        }
      } catch {
        // A declaration the console could not read leaves every field at the default the runtime
        // itself uses. The panel says `tenant`, which is exactly what the field then is.
        if (!stopped) {
          setDeclared({});
        }
      }
    })();
    return () => {
      stopped = true;
    };
  }, [agent, credentials]);

  return declared;
}
