/** Simulations: the form down the left, the simulated call beside it — heard live, both sides, and read as it happens. */

import { useEffect, useRef, type ReactNode } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";

import { useListen } from "../../lib/use-listen";
import { useOrg } from "../../lib/org";
import { Button, usePane } from "../../ui";
import { SimulateForm } from "../calls/simulate-form";
import { Live } from "../live";
import "./simulations.css";

/**
 * The screen. A simulation is started from the form and watched right here: the URL names the call
 * (`/simulations/<call>?agent=…&spoken=1`), so a reload lands on the same call. A spoken one is
 * heard the moment its room opens — the caller the model plays and the agent, one ear on both.
 */
export function Simulations(): ReactNode {
  const { agents } = useOrg();
  const call = useParams()["call"];
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const pane = usePane({ name: "simulations.form", initial: 340, min: 280, max: 520, side: "left" });
  const agent = search.get("agent") ?? undefined;
  const spoken = search.get("spoken") === "1";

  const started = (next: string, on: string, voice: boolean): void => {
    const asked = new URLSearchParams({ agent: on, ...(voice ? { spoken: "1" } : {}) });
    void navigate(`/simulations/${next}?${asked.toString()}`);
  };

  return (
    <div className="sims" style={pane.style}>
      {pane.handle}
      <aside className="sims-side" aria-label="start a simulation">
        {agents.length === 0 ? (
          <p className="sims-note">No agent is held here yet: run `pinecall start` in the agent's directory, and it shows up to simulate against.</p>
        ) : (
          <SimulateForm agents={agents.map((one) => one.slug)} spoken onStarted={started} />
        )}
        <p className="sims-note">
          A model plays the persona against the agent. With Voice on, the call is a real line and you hear both of them here as it happens.
          Max turns is where the caller stops, if it has not hung up before.
        </p>
      </aside>
      {call === undefined ? (
        <div className="sims-nothing">Pick an agent and a persona, then call. The simulation opens here, and you hear it live.</div>
      ) : (
        <div className="sims-watch" key={call}>
          {spoken && <Ear call={call} />}
          <Live call={call} agent={agent} />
        </div>
      )}
    </div>
  );
}

// A spoken simulation's room opens a moment after the call has its id, so the ear knocks again
// until it is in, and a call that ended before it ever got in stops knocking.
const KNOCK_MS = 1000;
const KNOCKS = 30;

/** One ear on the whole room, the caller's track and the agent's, joined and unmuted on its own. */
function Ear({ call }: { call: string }): ReactNode {
  const ear = useListen(call);
  const knocks = useRef(0);
  const inside = useRef(false);

  useEffect(() => {
    if (ear.listening === "off" && !inside.current && knocks.current === 0) {
      knocks.current = 1;
      void ear.join();
    }
    if (ear.listening === "failed" && !inside.current && knocks.current < KNOCKS) {
      const again = window.setTimeout(() => {
        knocks.current += 1;
        void ear.join();
      }, KNOCK_MS);
      return () => window.clearTimeout(again);
    }
    // In the room: heard at once — this screen is for listening, not for reading first.
    if (ear.listening === "muted" && !inside.current) {
      inside.current = true;
      ear.hear(true);
    }
    return undefined;
  }, [ear]);

  const said = ((): string => {
    switch (ear.listening) {
      case "on":
        return "Listening live · the caller and the agent";
      case "muted":
        return "Muted";
      case "joining":
        return "Joining the call…";
      case "failed":
        return knocks.current < KNOCKS ? "Waiting for the call's room to open…" : `Could not join the call: ${ear.error ?? "no room"}`;
      case "off":
        return inside.current ? "The call is over" : "Joining the call…";
    }
  })();

  return (
    <div className="sims-ear" role="status">
      <span className={ear.listening === "on" ? "sims-ear-dot sims-ear-dot-on" : "sims-ear-dot"} />
      <span className="sims-ear-said">{said}</span>
      {ear.listening === "on" && (
        <Button size="sm" pill onClick={() => ear.hear(false)}>
          Mute
        </Button>
      )}
      {ear.listening === "muted" && (
        <Button size="sm" pill onClick={() => ear.hear(true)}>
          Unmute
        </Button>
      )}
    </div>
  );
}
