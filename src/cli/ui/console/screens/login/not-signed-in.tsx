/** What a machine's own console says when the gateway refused that machine's key. */

import type { ReactNode } from "react";

import "../../shell/shell.css";

/**
 * The local console holds no key — `pinecall serve` signs what it forwards — so a refusal is not
 * something a form here can answer. The key in this machine's profile was revoked, or never was:
 * the terminal is where that is fixed, and this says the two commands.
 */
export function NotSignedIn(): ReactNode {
  return (
    <div className="way">
      <div className="way-card">
        <div className="way-mark">
          <b>pinecall</b> <span>/</span> console · local
        </div>
        <h1 className="way-title">This machine is not signed in</h1>
        <p className="way-lede">
          The gateway refused the key <code>pinecall serve</code> is using. Sign this machine in again, then start it
          once more:
        </p>
        <pre className="fixed">pinecall login{"\n"}pinecall serve</pre>
      </div>
    </div>
  );
}
