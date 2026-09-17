/** ROOM: who is in the LiveKit room right now, who is speaking, and the number a phone call rang. */

import type { Room } from "@pinecall/protocol";
import type { ReactNode } from "react";

import { Dot, SectionLabel } from "../../ui";

/** The room's participants as the room reported them. A text session has none and says so. */
export function RoomPanel({ room, from, over }: { room: Room | null; from: string | null; over: boolean }): ReactNode {
  return (
    <>
      <SectionLabel ruled>Room</SectionLabel>
      {room === null ? (
        <div className="lv-pane-text">No room: this session carries no media.</div>
      ) : (
        <div className="lv-pane-text">
          {over ? "Audio room closed" : "Audio room open"} · {room.participants.length}{" "}
          {room.participants.length === 1 ? "participant" : "participants"}
          {from !== null && <> · rang from {from}</>}
          <ul className="lv-people">
            {room.participants.map((who) => (
              <li className="lv-person" key={who.identity}>
                <details>
                  <summary>
                    <Dot tone={who.speaking ? "green" : undefined} small />
                    <span>{who.name ?? who.identity}</span>
                    <span className="lv-person-kind">{who.kind}</span>
                  </summary>
                  {/* The trunk's own headers: for a phone call this is where the SIP number is. */}
                  <pre className="lv-data">{JSON.stringify(who.attributes, null, 2)}</pre>
                </details>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
