// Request headers for the gateway: the API key and the expected world.

/** A runtime instance's world, as published at /.well-known/pinecall. */
export type World = "sandbox" | "production";

/**
 * Header naming the world the client expects. It does not select one: an instance of the other
 * world refuses the request, and production refuses a person's key without it. Server tokens may
 * omit it.
 */
export const ENV_HEADER = "pinecall-env";

/**
 * Headers for one request or socket upgrade: the key as a Bearer (never in a URL, which lands in
 * access logs) and the world if given. An empty key sends no authorization header.
 */
export function signed(apiKey: string, world?: World): Record<string, string> {
  const headers: Record<string, string> = apiKey === "" ? {} : { authorization: `Bearer ${apiKey}` };
  if (world !== undefined) headers[ENV_HEADER] = world;
  return headers;
}
