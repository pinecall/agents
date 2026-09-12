/** Numbers: the doors the org answers in this world — number, channel, agent, and who typed it. */

import { useEffect, useState, type ReactNode } from "react";

import { GatewayError } from "../../lib/api";
import { useCredentials } from "../../lib/credentials";
import { useWhoami } from "../../lib/whoami";
import { readNumbers, type Answering } from "./door";
import "./numbers.css";

/**
 * The table `pinecall-runtime routes list` prints, for the world the key opens. `operator` is a
 * row the operator typed and outranks a declaration; `app` is a door the running app declared and
 * nobody typed over. Importing or buying a number is a later card; today the command is named.
 */
export function Numbers(): ReactNode {
  const credentials = useCredentials();
  const whose = useWhoami();
  const [doors, setDoors] = useState<Answering[] | null>(null);
  const [refused, setRefused] = useState<string | null>(null);

  useEffect(() => {
    let gone = false;
    readNumbers(credentials).then(
      (answered) => {
        if (!gone) setDoors(answered);
      },
      (failed: unknown) => {
        if (!gone) setRefused(failed instanceof GatewayError ? failed.message : String(failed));
      },
    );
    return () => {
      gone = true;
    };
  }, [credentials]);

  const org = whose?.org ?? "<org>";
  return (
    <div className="numbers">
      <h1 className="numbers-title">Numbers</h1>
      <p className="numbers-lede">Which number reaches which agent, and through which door, in this world.</p>
      {refused !== null && <p className="numbers-note fixed">{refused}</p>}
      {doors !== null && doors.length === 0 && (
        <div className="numbers-empty">
          <p className="numbers-empty-title">No number answers for this org yet</p>
          <p className="numbers-note fixed">
            An operator types one: <span className="numbers-cmd">pinecall-runtime routes add &lt;number&gt; &lt;agent&gt; --org {org}</span>
            {" "}— or the app declares a door and it appears here as <span className="numbers-cmd">app</span>.
          </p>
        </div>
      )}
      {doors !== null && doors.length > 0 && (
        <div className="numbers-panel">
          <div className="numbers-row numbers-row-head fixed">
            <span>NUMBER</span>
            <span>CHANNEL</span>
            <span>AGENT</span>
            <span>WORLD</span>
            <span>SOURCE</span>
          </div>
          {doors.map((door) => (
            <div key={`${door.route.channel}-${door.route.number ?? door.route.agent}`} className="numbers-row">
              <span className="fixed">{door.route.number ?? "—"}</span>
              <span className="numbers-channel">{door.route.channel}</span>
              <span className="fixed">{door.route.agent}</span>
              <span className="fixed numbers-dim">{door.route.env}</span>
              <span className={door.source === "operator" ? "fixed numbers-operator" : "fixed numbers-dim"}>{door.source}</span>
            </div>
          ))}
        </div>
      )}
      {doors !== null && doors.length > 0 && (
        <p className="numbers-note fixed">
          {doors.length} door{doors.length === 1 ? "" : "s"} · an operator's row outranks a declaration · the same rows{" "}
          <span className="numbers-cmd">pinecall-runtime routes list --org {org}</span> prints
        </p>
      )}
    </div>
  );
}
