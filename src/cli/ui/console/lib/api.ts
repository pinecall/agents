/** The one place a request to the gateway is built: the base, and one error shape. */

// The console is served by `pinecall ui` under a path of its own, and every door of the gateway
// is reached through that same path: the CLI forwards `v1/*` to the gateway and puts the org key
// on the header there. So the page holds no key, sends none, and the base is the only address it
// knows — read once off the path it was opened at (lib/base.ts).
/** Where this console is mounted. Every door is relative to it. */
export interface Credentials {
  base: string;
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

/** One JSON door, read. The caller parses the body with the protocol's own schema. */
export async function read(
  credentials: Credentials,
  path: string,
  params: Params = {},
): Promise<unknown> {
  const answer = await fetch(doorAt(credentials, path, params));
  return answered(answer);
}

/** One JSON door, written whole. The caller parses the answer with the protocol's own schema. */
export async function put(credentials: Credentials, path: string, body: unknown): Promise<unknown> {
  const answer = await fetch(doorAt(credentials, path, {}), {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return answered(answer);
}

/** One JSON door, asked. The caller parses the answer with the protocol's own schema. */
export async function post(credentials: Credentials, path: string, body: unknown): Promise<unknown> {
  const answer = await fetch(doorAt(credentials, path, {}), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return answered(answer);
}

/** One door, asked to delete what is behind it. A 204 with no body is an answer, not an error. */
export async function drop(credentials: Credentials, path: string): Promise<unknown> {
  return answered(await fetch(doorAt(credentials, path, {}), { method: "DELETE" }));
}

/** The URL an EventSource opens. The CLI in front of it signs the request like any other. */
export function streamUrl(credentials: Credentials, path: string, params: Params = {}): string {
  return doorAt(credentials, path, params).toString();
}

// ── how one is built ────────────────────────────────────────────────────────────

type Params = Record<string, string | number>;

// Every verb ends here, so an answer becomes a value or an error in one place. A 401 or a 403 is
// the CLI's key being refused by the gateway, which no screen can fix: it is reported like any
// other refusal, in the gateway's own words.
const NO_BODY = 204;

async function answered(answer: Response): Promise<unknown> {
  if (answer.ok) {
    return answer.status === NO_BODY ? null : answer.json();
  }
  throw new GatewayError(answer.status, await detail(answer));
}

function doorAt(credentials: Credentials, path: string, params: Params): URL {
  const door = new URL(credentials.base + path, window.location.origin);
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
