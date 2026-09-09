/** The verdict a finished call was sealed with: one request, one entry, read from the log's last seq. */

import { CallScoreSchema, LogPageSchema, TERMINAL_EVENT, type CallScore } from "@pinecall/protocol";

import { read, type Credentials } from "./api";

// `call.score` is the entry the log SEALS on (TERMINAL_EVENT, docs/decisions/scoring.md), so on a
// finished call it is the entry at `last_seq` and nowhere else. Reading from one below it is
// therefore one request and one entry, rather than paging a whole conversation to reach its end.
/** The verdict a finished call was sealed with, or null when the log carries none. */
export async function readScore(
  credentials: Credentials,
  call: string,
  lastSeq: number,
): Promise<CallScore | null> {
  if (lastSeq <= 0) {
    return null;
  }
  const page = LogPageSchema.parse(
    await read(credentials, `/v1/calls/${encodeURIComponent(call)}/events`, {
      after: lastSeq - 1,
      types: TERMINAL_EVENT,
      limit: 1,
    }),
  );
  const sealed = page.entries.find((entry) => entry.type === TERMINAL_EVENT);
  return sealed === undefined ? null : CallScoreSchema.parse(sealed.data);
}
