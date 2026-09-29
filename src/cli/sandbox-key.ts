/** Obtain and cache a person's sandbox key, minted from a production login code. */

import { keepMinted, mintedFor } from "./signed-in.js";
import { aLoginCode } from "./start-console.js";
import { asked, Refused, type Door } from "./testing/gateway.js";
import { thisMachine } from "./this-machine.js";
import { whoIs } from "./whoami.js";
import { SANDBOX } from "./world.js";

// Sandbox person keys expire after a day, or are revoked when the member is disabled in production.
const NOT_TAKEN = 401;

/**
 * Return this person's sandbox key, minting one if the cached key is missing or rejected.
 * Flow: `POST <production>/v1/login/codes`, then `POST <sandbox>/v1/login {code, device}`.
 * Cached in session.json under the sandbox URL.
 */
export async function aSandboxKey(production: Door, sandbox: string, home: string): Promise<string> {
  const kept = mintedFor(sandbox, production.apiKey, home);
  if (kept !== undefined) {
    if (await stillTaken({ url: sandbox, apiKey: kept, world: SANDBOX })) return kept;
    keepMinted(sandbox, production.apiKey, undefined, home);
  }
  const code = await aLoginCode(production);
  const minted = await asked<{ key: string }>({ url: sandbox, apiKey: "", world: SANDBOX }, "/v1/login", {
    method: "POST",
    body: { code, device: thisMachine() },
  });
  keepMinted(sandbox, production.apiKey, minted.key, home);
  return minted.key;
}

/** Whether the sandbox still accepts a key: false on 401, other errors are rethrown. */
async function stillTaken(door: Door): Promise<boolean> {
  try {
    await whoIs(door);
    return true;
  } catch (refused) {
    if (refused instanceof Refused && refused.status === NOT_TAKEN) return false;
    throw refused;
  }
}
