/** The one place a request to the gateway is built: the base, the key, one error shape, one 401 hook. */

// The gateway serves the console at `/` and every door of it under `/v1`. The page holds ONE
// credential: a person's scoped key, minted for them and this browser at login and kept for the
// tab's life (lib/session-key.ts). Never the org's key — that one lives in `pinecall run`'s
// process and reaches a browser only as a one-use `?login=` code (lib/login.ts).
/** Where this console is mounted, and the key it knocks with. */
export interface Credentials {
  base: string;
  key: string;
}

/** A door answered with something other than 200. `status` is the gateway's, `message` its detail. */
export class GatewayError extends Error {
  override readonly name = "GatewayError";

  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** The headers every request carries: the key, as a Bearer. This is the one line that spells it. */
export function headersFor(credentials: Credentials): Record<string, string> {
  return { authorization: `Bearer ${credentials.key}` };
}

// A 401 while the app is mounted is the key dying under it — revoked, or the gateway restarted on
// a dev key — and the honest answer is the login screen again, not a page of refusals. The boot
// installs the one listener; nothing else here decides what a dead key means.
let unauthorized: (() => void) | null = null;

/** What runs when a door answers 401. Installed once, by the boot. */
export function onUnauthorized(listener: () => void): void {
  unauthorized = listener;
}

/** One JSON door, read. The caller parses the body with the protocol's own schema. */
export async function read(credentials: Credentials, path: string, params: Params = {}): Promise<unknown> {
  const answer = await fetch(doorAt(credentials, path, params), { headers: headersFor(credentials) });
  return answered(answer);
}

/** One JSON door, written whole. The caller parses the answer with the protocol's own schema. */
export async function put(credentials: Credentials, path: string, body: unknown): Promise<unknown> {
  const answer = await fetch(doorAt(credentials, path, {}), {
    method: "PUT",
    headers: { ...headersFor(credentials), "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return answered(answer);
}

/** One JSON door, asked. The caller parses the answer with the protocol's own schema. */
export async function post(credentials: Credentials, path: string, body: unknown): Promise<unknown> {
  const answer = await fetch(doorAt(credentials, path, {}), {
    method: "POST",
    headers: { ...headersFor(credentials), "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return answered(answer);
}

/** One door, asked to delete what is behind it. A 204 with no body is an answer, not an error. */
export async function drop(credentials: Credentials, path: string): Promise<unknown> {
  return answered(await fetch(doorAt(credentials, path, {}), { method: "DELETE", headers: headersFor(credentials) }));
}

/** The URL of one door, for the readers that open it themselves: the stream, the recording. */
export function doorUrl(credentials: Credentials, path: string, params: Params = {}): string {
  return doorAt(credentials, path, params).toString();
}

// ── how one is built ────────────────────────────────────────────────────────────

type Params = Record<string, string | number>;

const NO_BODY = 204;
const UNAUTHORIZED = 401;

/** The answer as a value, or a GatewayError in the gateway's words. A 401 also wakes the boot. */
export async function answered(answer: Response): Promise<unknown> {
  if (answer.ok) {
    return answer.status === NO_BODY ? null : answer.json();
  }
  if (answer.status === UNAUTHORIZED) unauthorized?.();
  throw new GatewayError(answer.status, await detail(answer));
}

function doorAt(credentials: Credentials, path: string, params: Params): URL {
  const door = new URL(credentials.base.replace(/\/$/, "") + path, window.location.origin);
  for (const [name, value] of Object.entries(params)) {
    door.searchParams.set(name, String(value));
  }
  return door;
}

// FastAPI says why in `detail`. A door that answered with something else still owes the reader a
// sentence, so the status line stands in for it rather than an empty message.
async function detail(answer: Response): Promise<string> {
  try {
    const body: unknown = await answer.json();
    const said = (body as { detail?: unknown }).detail;
    return typeof said === "string" ? said : answer.statusText;
  } catch {
    return answer.statusText;
  }
}
