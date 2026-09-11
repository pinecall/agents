/** A refusal from one of the console's own doors: a sentence for the page, and the status it travels under. */

import { Refused } from "../testing/gateway.js";
import { refusal } from "../whoami.js";

/** Thrown by a door of this process; the server writes it as `{detail}` under `status`, as FastAPI would. */
export class Refusal extends Error {
  override readonly name = "Refusal";

  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * What went wrong, as the page reads it. Three things end up here and they are not the same: this
 * process refusing (a Refusal, with the status it chose), the GATEWAY refusing this process (its
 * own status and its own sentence, which names the fix and which nothing here knows better than),
 * and anything else, which is a 500 and a message.
 */
export function refusedAs(failed: unknown): { status: number; detail: string } {
  if (failed instanceof Refusal) return { status: failed.status, detail: failed.message };
  if (failed instanceof Refused) return { status: failed.status, detail: refusal(failed) };
  return { status: 500, detail: failed instanceof Error ? failed.message : String(failed) };
}