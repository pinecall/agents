/** A call's log read whole: every durable entry, page by page, oldest first, until a short page. */

import { LogPageSchema, type Entry } from "@pinecall/protocol";

import { read, type Credentials } from "../../shared/api";

// The gateway answers a page of at most this many entries and refuses to be asked for more
// (the runtime's log/store/protocol.py). A page shorter than what was asked for is the last
// one — the same rule the runtime pages a whole call with, in log/replay.py.
const A_WHOLE_PAGE = 500;

// Page until a short page says that was all. The door answers 204 to a cursor already at the end of
// a sealed call, and a short page is how a reader stops before ever asking that question.
/** Every entry of one call so far. A call whose log has not been opened yet is a 404 the caller reads. */
export async function wholeLog(credentials: Credentials, call: string): Promise<Entry[]> {
  const whole: Entry[] = [];
  let cursor = 0;
  for (;;) {
    const page = LogPageSchema.parse(
      await read(credentials, `/v1/calls/${call}/events`, { after: cursor, limit: A_WHOLE_PAGE }),
    );
    whole.push(...page.entries);
    if (page.next === null || page.entries.length < A_WHOLE_PAGE) {
      return whole;
    }
    cursor = page.next;
  }
}
