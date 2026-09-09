/** ROOM: who is in the LiveKit room right now, who is speaking, and the number a phone call rang. */

import type { Room } from "@pinecall/protocol";
import type { ReactNode } from "react";

/** The room's participants as the room reported them. A text session has none and says so. */
export function RoomPanel({ room, from }: { room: Room | null; from: string | null }): ReactNode {
  return (
    <section className="live-panel">
      <h3 className="live-panel-name">ROOM</h3>
      {room === null ? (
        <p className="live-panel-empty">No room: this session carries no media.</p>
      ) : (
        <>
          <p className="live-panel-line fixed">
            {room.name} · {room.sid}
          </p>
          {from === null ? null : <p className="live-panel-line fixed">from {from}</p>}
          <ul className="participants">
            {room.participants.map((who) => (
              <li className="participant" key={who.identity}>
                <details>
                  <summary className="participant-line">
                    <span className={who.speaking ? "participant-speaking" : "participant-quiet"}>●</span>
                    <span className="participant-who fixed">{who.name ?? who.identity}</span>
                    <span className="participant-kind">{who.kind}</span>
                  </summary>
                  {/* The trunk's own headers: for a phone call this is where the SIP number is. */}
                  <pre className="live-mark-data fixed">{JSON.stringify(who.attributes, null, 2)}</pre>
                </details>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
