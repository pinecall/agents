// What every request to the gateway carries: whose key, and which world it believes it is in.

/** The two worlds. An instance of the runtime is one of them, and names it at /.well-known/pinecall. */
export type World = "sandbox" | "production";

/**
 * The header a request names its world with. It chooses nothing: an instance IS one world, and
 * the header is what the client believes it is talking to — an instance of the other world
 * refuses the request rather than answer it from the wrong one, and production refuses a person's
 * key that names none. The CLI names it on every request; a server's token was made for one world
 * and may leave it out.
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
