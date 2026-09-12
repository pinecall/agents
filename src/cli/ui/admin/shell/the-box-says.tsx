/** Which box this tab is looking at, in the header: two of them open at once is the whole reason. */

import { useEffect, useState, type ReactNode } from "react";

import { useCredentials } from "../../shared/credentials";
import { named, theBox, type TheBox } from "../lib/the-box";

export function TheBoxSays(): ReactNode {
  const credentials = useCredentials();
  const [box, setBox] = useState<TheBox | null>(null);

  useEffect(() => {
    let gone = false;
    theBox(credentials).then(
      (said) => {
        if (!gone) setBox(said);
      },
      // A refusal here is the key dying, and api.ts has already told the boot: nothing to say.
      () => undefined,
    );
    return () => {
      gone = true;
    };
  }, [credentials]);

  if (box === null) return null;
  return (
    <span className="head-whose fixed">
      {named(box)} · {box.version}
    </span>
  );
}
