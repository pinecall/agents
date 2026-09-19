// One base URL, four doors. The app configures a host; nothing else writes a path.

/** `WS /v1/apps`, from whatever base the app gave: http and https are the same host as ws and wss. */
export function appsUrl(base: string): string {
  return doorAt(base, "/v1/apps", true);
}

/** `GET /v1/calls/{id}/events`: one call's log, as a JSON page or as SSE. */
export function callLogUrl(base: string, call: string): string {
  return doorAt(base, `/v1/calls/${encodeURIComponent(call)}/events`, false);
}

/** `GET /v1/agents/{slug}/calls`: the agent's own log — registrations, configurations, errors. */
export function agentLogUrl(base: string, agent: string): string {
  return doorAt(base, `/v1/agents/${encodeURIComponent(agent)}/calls`, false);
}

/** `POST /v1/calls/{id}/lookup`: one search of the bases the agent reads, run by the gateway for this call. */
export function lookupUrl(base: string, call: string): string {
  return doorAt(base, `/v1/calls/${encodeURIComponent(call)}/lookup`, false);
}

function doorAt(base: string, path: string, websocket: boolean): string {
  const url = new URL(base);
  const secure = url.protocol === "https:" || url.protocol === "wss:";
  url.protocol = websocket ? (secure ? "wss:" : "ws:") : secure ? "https:" : "http:";
  url.pathname = `${url.pathname.replace(/\/$/, "")}${path}`;
  return url.toString();
}
