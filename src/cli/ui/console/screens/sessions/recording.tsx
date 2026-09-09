/** The call's audio, when the summary points at any: played off the gateway's own door. */

import type { ReactNode } from "react";

import { streamUrl } from "../../lib/api";
import { useCredentials } from "../../lib/credentials";

// call.summary carries the pointer and nothing else does (the runtime's worker/
// recordings.py composes it). The file is on the box that took the call; the gateway's
// `GET /v1/calls/{call}/recording` serves it from there, in byte ranges so the player can seek,
// and this tab reaches that door the way it reaches every other — through the CLI, which signs it.
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
  return <audio className="player" controls preload="none" src={streamUrl(credentials, `/v1/calls/${call}/recording`)} />;
}
