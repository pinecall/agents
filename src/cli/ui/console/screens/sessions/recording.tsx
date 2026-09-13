/** The call's audio, when the summary points at any: fetched with the key, played from a blob. */

import { useEffect, useState, type ReactNode } from "react";

import { doorUrl, headersFor } from "../../../shared/api";
import { useCredentials } from "../../../shared/credentials";

// call.summary carries the pointer and nothing else does (the runtime's worker/recordings.py
// composes it). The file is on the box that took the call; the gateway's
// `GET /v1/calls/{call}/recording` serves it from there. An <audio src> sends no header and the
// key never rides a URL, so the bytes are fetched with the key and handed to the player as an
// object URL — whole, which a call of minutes is — and revoked when the player leaves.
/** Where the call's audio was written, as the summary states it. Null when nothing was recorded. */
export function recordingIn(summary: Record<string, unknown> | undefined): string | null {
  const path = summary?.["recording"];
  return typeof path === "string" && path !== "" ? path : null;
}

export function Recording({ call, path }: { call: string; path: string | null }): ReactNode {
  if (path === null) {
    return null;
  }
  return (
    <section className="section">
      <h2 className="section-title">Listen to this call</h2>
      <Player call={call} />
      <p className="note">
        {path} on the box that took the call — the same bytes <span className="fixed">pinecall-runtime sessions recording {call}</span>{" "}
        points at. Nothing of a call leaves the box except through this door.
      </p>
    </section>
  );
}

/** The player alone, for a screen that already said what it is. */
export function Player({ call }: { call: string }): ReactNode {
  const credentials = useCredentials();
  const [src, setSrc] = useState<string | null>(null);
  const [refused, setRefused] = useState<string | null>(null);

  // `.then(onFulfilled, onRejected)` was the shape here, and a `throw` inside the FIRST handler
  // never reaches the second one — it becomes a rejection nobody owns. So every refusal the
  // gateway answered, which is every call that was not recorded, left this sitting at "reading
  // the recording…" for as long as the tab stayed open. Only a network failure ever reached the
  // handler that says so. One try/catch, as every other read in this page does.
  useEffect(() => {
    let url: string | null = null;
    let gone = false;
    void (async () => {
      try {
        const answer = await fetch(doorUrl(credentials, `/v1/calls/${call}/recording`), {
          headers: headersFor(credentials),
        });
        if (!answer.ok) throw new Error(await whyNot(answer));
        url = URL.createObjectURL(await answer.blob());
        if (gone) URL.revokeObjectURL(url);
        else setSrc(url);
      } catch (failed) {
        if (!gone) setRefused(failed instanceof Error ? failed.message : String(failed));
      }
    })();
    return () => {
      gone = true;
      if (url !== null) URL.revokeObjectURL(url);
    };
  }, [call, credentials]);

  if (refused !== null) return <p className="note">{refused}</p>;
  if (src === null) return <p className="note">reading the recording…</p>;
  return <audio className="player" controls preload="none" src={src} />;
}

// The gateway's own sentence, which is the whole answer: "the recording of <call> is at <path> on
// the box that took the call, and not on this one" tells a person where to look. A status code
// tells them nothing. The status is the fallback for a body that is not the shape we expect.
async function whyNot(answer: Response): Promise<string> {
  try {
    const said: unknown = await answer.json();
    const detail = (said as { detail?: unknown }).detail;
    if (typeof detail === "string") return detail;
  } catch {
    // Not JSON, which a proxy in front of the gateway can answer with. The status is what is left.
  }
  return `the recording answered ${answer.status}`;
}
