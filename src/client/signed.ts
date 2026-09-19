// What every request to the gateway carries: whose key, and which world it asks for.

/** The two worlds a gateway holds. A person's key opens either, as far as their org allows. */
export type World = "sandbox" | "production";

/**
 * The header a request names its world with. A person holds one key and works in both worlds, so
 * the world is the request's: none named is the sandbox, and production answers only while the
 * person's row opens it. A server's token was made for one world and needs none.
 */
export const ENV_HEADER = "pinecall-env";

/**
 * The headers that sign one request, the socket's upgrade included: the key as a Bearer — never in
 * a URL, which ends up in an access log — and the world when one was named. An empty key signs
 * nothing, because what is not held is not claimed (the door that mints the first key takes none).
 */
export function signed(apiKey: string, world?: World): Record<string, string> {
  const headers: Record<string, string> = apiKey === "" ? {} : { authorization: `Bearer ${apiKey}` };
  if (world !== undefined) headers[ENV_HEADER] = world;
  return headers;
}
