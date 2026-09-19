/** The SDK client a verb holds: the door's gateway, its key, and the world the command named. */

import { Pinecall } from "../client/client.js";
import type { Door } from "./testing/gateway.js";

/** A client for this door. A verb that opens no socket never imports this, and so never `ws`. */
export function pinecallFor(door: Door): Pinecall {
  return new Pinecall({ url: door.url, apiKey: door.apiKey, ...(door.world === undefined ? {} : { env: door.world }) });
}
