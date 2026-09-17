/** Whether the person signed in runs this box: asked once, of the operator's own whoami door. */

import { useEffect, useState } from "react";

import { doorUrl, headersFor } from "../../shared/api";
import { useCredentials } from "../../shared/credentials";
import { MODE } from "./mode";

// A person the box made an operator opens /v1/ops/* with their own key (the runtime's
// api/_operator.py); everybody else is answered 401 there. So the question costs one read, and a
// refusal IS the answer — never an error anybody is shown.
//
// Asked with a fetch of its own and never through the shared reader: there, a 401 means the key
// died and the page signs the person out, and here a 401 only means "not an operator".

/**
 * True for an operator, false for anybody else, null until the door has answered.
 *
 * The gateway's console only: a machine's own console holds a sandbox key, and the box is run
 * from the page that shows production.
 */
export function useOperator(): boolean | null {
  const credentials = useCredentials();
  const [operator, setOperator] = useState<boolean | null>(MODE === "hosted" ? null : false);

  useEffect(() => {
    if (MODE !== "hosted") return undefined;
    let gone = false;
    fetch(doorUrl(credentials, "/v1/ops/whoami"), { headers: headersFor(credentials) }).then(
      (answer) => {
        if (!gone) setOperator(answer.ok);
      },
      () => {
        // A door that is down draws the same rail as somebody who is not one.
        if (!gone) setOperator(false);
      },
    );
    return () => {
      gone = true;
    };
  }, [credentials]);

  return operator;
}
