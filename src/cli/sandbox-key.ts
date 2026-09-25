/** A person's key at the sandbox: minted there from a code production's key asked for, and kept. */

import { keepMinted, mintedFor } from "./signed-in.js";
import { aLoginCode } from "./start-console.js";
import { asked, Refused, type Door } from "./testing/gateway.js";
import { thisMachine } from "./this-machine.js";
import { whoIs } from "./whoami.js";
import { SANDBOX } from "./world.js";

// What a key the gateway no longer takes is answered with: a sandbox's person key lives a day, and
// one of a member production disabled is revoked at their next sign-in.
const NOT_TAKEN = 401;

/**
 * The key this person holds at that sandbox, minted from the production door's key.
 *
 * The sandbox keeps no password: a person signs in at production, and a one-use code minted there
 * crosses — `POST <production>/v1/login/codes`, then `POST <sandbox>/v1/login {code, device}`, which
 * asks production who the code names and mints a key of the sandbox's own. That key is kept in
 * session.json under the sandbox's URL, beside the production key it came from. A kept key the
 * sandbox no longer takes is minted again, once; the new one refused is the refusal, said.
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

/** Whether the sandbox still takes a kept key: a 401 is no, and any other refusal is the verb's to say. */
async function stillTaken(door: Door): Promise<boolean> {
  try {
    await whoIs(door);
    return true;
  } catch (refused) {
    if (refused instanceof Refused && refused.status === NOT_TAKEN) return false;
    throw refused;
  }
}
