/** Production / Sandbox: which world the tab looks at, and the turn to the other one. */

import { useState, type ReactNode } from "react";

import { GatewayError } from "../../shared/api";
import type { World } from "../lib/session-key";
import { useWorld } from "../lib/world";

const WORLDS: readonly World[] = ["production", "sandbox"];

/**
 * Two words, one of them lit. Turning needs a key for the other world: a kept one, or one the
 * gateway mints for the same person. A refusal — an org's machine key opens one world — is the
 * gateway's sentence, shown beside the switch, verbatim.
 */
export function WorldToggle(): ReactNode {
  const { world, turnTo } = useWorld();
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);

  const turn = async (other: World): Promise<void> => {
    if (other === world || busy) return;
    setBusy(true);
    setRefused(null);
    try {
      await turnTo(other);
    } catch (failed) {
      setRefused(failed instanceof GatewayError ? failed.message : String(failed));
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="world">
      <span className="world-switch fixed" role="group" aria-label="which world">
        {WORLDS.map((one) => (
          <button
            key={one}
            type="button"
            className={one === world ? "world-option world-option-here" : "world-option"}
            onClick={() => void turn(one)}
            disabled={busy}
            aria-pressed={one === world}
          >
            {one}
          </button>
        ))}
      </span>
      {refused !== null && <span className="world-refused fixed">{refused}</span>}
    </span>
  );
}
