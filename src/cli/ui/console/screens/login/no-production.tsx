/** What the gateway's console says to a person their org has not let act in production. */

import type { ReactNode } from "react";

import { BASE } from "../../lib/base";
import { forgetKey } from "../../lib/session-key";
import { TextAction } from "../../ui";
import { WayIn } from "./way-in";

/**
 * The gateway's console is production's, and the gateway lets a person's key in only while their
 * row says they act there. Refused, there is no page to draw: this says the gateway's own sentence,
 * where their own work is, and lets them sign in as somebody else.
 */
export function NoProduction({ said }: { said: string }): ReactNode {
  const leave = (): void => {
    forgetKey();
    window.location.assign(BASE);
  };
  return (
    <WayIn foot={<>Your sandbox is on your machine: <span className="login-command">pinecall serve</span> in your project's folder.</>}>
      <h1 className="login-title">No production access</h1>
      <p className="login-lede">{said}</p>
      <TextAction onClick={leave}>Sign in as somebody else</TextAction>
    </WayIn>
  );
}
