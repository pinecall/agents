/** The widget as this gateway serves it, loaded once, and one tag mounted with this key minting its tokens. */

import { post, type Credentials } from "../../../shared/api";
import { gatewayOrigin } from "../../lib/mode";

// The gateway is the CDN: the runtime copies the widget in beside the console (scripts/console)
// and serves it with the CORS header a module script needs, so a site embeds this very URL.
// On a machine's own console the gateway is elsewhere, and a site must never be handed a
// localhost URL: the tag names the gateway either way.
export function widgetUrl(): string {
  return `${gatewayOrigin()}/widget/pinecall-widget.js`;
}

let loading: Promise<void> | null = null;

/** Load the widget's module from this gateway, once per page. Rejects with the reason it could not. */
export function loadWidget(): Promise<void> {
  loading ??= import(/* @vite-ignore */ widgetUrl()).then(
    () => undefined,
    (failed: unknown) => {
      loading = null;
      throw new Error(`the widget did not load from ${widgetUrl()}: ${failed instanceof Error ? failed.message : String(failed)}`);
    },
  );
  return loading;
}


/** What the widget's element takes beyond its attributes: the function this page mints with. */
export interface WidgetElement extends HTMLElement {
  tokenProvider?: (scope: string, agent: string) => Promise<unknown>;
  toggle?: () => void;
}

/** One tag for this agent, minting through the token door with this key, appended to `into`. */
export function mountWidget(
  into: HTMLElement,
  credentials: Credentials,
  agent: string,
  attributes: Record<string, string>,
): WidgetElement {
  const element = document.createElement("pinecall-widget") as WidgetElement;
  element.setAttribute("agent", agent);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  element.tokenProvider = (scope) => post(credentials, "/v1/tokens", { agent, scope, ttl_s: 60, metadata: { page: "console preview", scope } });
  into.replaceChildren(element);
  return element;
}
