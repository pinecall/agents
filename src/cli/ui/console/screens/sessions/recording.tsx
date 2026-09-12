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

  useEffect(() => {
    let url: string | null = null;
    let gone = false;
    fetch(doorUrl(credentials, `/v1/calls/${call}/recording`), { headers: headersFor(credentials) }).then(
      async (answer) => {
        if (!answer.ok) throw new Error(`the recording answered ${answer.status}`);
        url = URL.createObjectURL(await answer.blob());
        if (gone) URL.revokeObjectURL(url);
        else setSrc(url);
      },
      (failed: unknown) => {
        if (!gone) setRefused(failed instanceof Error ? failed.message : String(failed));
      },
    );
    return () => {
      gone = true;
      if (url !== null) URL.revokeObjectURL(url);
    };
  }, [call, credentials]);

  if (refused !== null) return <p className="note">{refused}</p>;
  if (src === null) return <p className="note">reading the recording…</p>;
  return <audio className="player" controls preload="none" src={src} />;
}
