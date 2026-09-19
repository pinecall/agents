/** What a machine's own console says when the gateway refused that machine's key. */

import type { ReactNode } from "react";

import { WayIn } from "./way-in";

/**
 * The local console holds no key — `pinecall serve` signs what it forwards — so a refusal is not
 * something a form here can answer. The key in the project's .env was revoked, or never was: the
 * terminal is where that is fixed, and this says the two commands.
 */
export function NotSignedIn(): ReactNode {
  return (
    <WayIn foot={<>This is your sandbox, on this machine. Production is watched on the gateway's console.</>}>
      <h1 className="login-title">This project is not linked</h1>
      <p className="login-lede">
        The gateway refused the key <span className="login-command">pinecall serve</span> is using. Link the project again, in its folder, then start it once more:
      </p>
      <pre className="login-commands">pinecall link{"\n"}pinecall serve</pre>
    </WayIn>
  );
}
