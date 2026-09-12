/** The two ways into the operator's page: a person who runs the box, or the box's own key. */

import { z } from "zod";

import { answered } from "../../shared/api";

// What POST /v1/login answers, of which this page needs one field. The console parses the whole
// shape because it keeps the key per world; this page keeps one key and opens one set of doors.
const SignedSchema = z.object({ key: z.string() });

// What this page's key is labelled in the org's key list, so a person revoking one knows which
// tab it was. It is a person's key like any other: `admin` is not a scope, it is a row.
const THIS_PAGE = "admin";

/**
 * A person's own key, minted by the same door the console logs in at.
 *
 * There is no login of the operator's own: whoever runs the box is a MEMBER of some org that
 * somebody holding the box's key marked as an operator (runtime 0020). So this is the ordinary
 * login, and what decides whether the page opens is what /v1/ops/whoami says next — a person who
 * is not an operator gets a key that opens their org and nothing here, and is told so.
 */
export async function signedIn(
  base: string,
  who: { org: string; email: string; password: string },
): Promise<string> {
  const answer = await fetch(new URL(`${base.replace(/\/$/, "")}/v1/login`, window.location.origin), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...who, device: THIS_PAGE }),
  });
  return SignedSchema.parse(await answered(answer)).key;
}
