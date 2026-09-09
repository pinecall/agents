/** A seat in a live call's room, minted through the CLI: what /listen and /supervise both answer. */

import { z } from "zod";

import { post, type Credentials } from "./api";

/** The two doors that seat a person in a call: one that only hears, one that may also speak. */
export type Seating = "listen" | "supervise";

// Both doors end in the runtime's tokens/seating.py and answer the same three fields: LiveKit's two and
// the identity the token was minted with. The console never sees the org key; the CLI in front of
// it spends that, and what comes back is good for this one call and nothing else.
const SeatSchema = z.object({
  server_url: z.string(),
  participant_token: z.string(),
  identity: z.string(),
});

/** Where a seat is and what opens it. The token is a room's, never the tenant's key. */
export type Seat = z.infer<typeof SeatSchema>;

/** Ask for a seat in one call, by the door that grants what this screen needs. */
export async function seatIn(credentials: Credentials, call: string, door: Seating): Promise<Seat> {
  return SeatSchema.parse(await post(credentials, `/v1/calls/${call}/${door}`, {}));
}
