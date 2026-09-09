/** The doors: the class's phone, whatsapp and web fields translated into the routes it registers. */

import type { RouteInput } from "../client/index.js";

/** The three config fields that are doors, in the order a console reads them. */
export type ChannelField = "phone" | "whatsapp" | "web";

// A door is declared by being truthy. `phone = "+34 910 000 000"` is a number; `web = true` is a
// channel with no number at all, which is what the widget is. `false`, `""` and undefined are
// "this agent does not answer there", not "answer with an empty number".
function routeOf(channel: ChannelField, value: unknown): RouteInput | null {
  if (value === undefined || value === null || value === false || value === "") return null;
  return { channel, number: typeof value === "string" ? value : null };
}

/** The phone line, when the class declares one. */
export function phoneRoute(value: unknown): RouteInput | null {
  return routeOf("phone", value);
}

/** The WhatsApp door, when the class declares one. */
export function whatsappRoute(value: unknown): RouteInput | null {
  return routeOf("whatsapp", value);
}

/** The web widget's door, which never carries a number. */
export function webRoute(value: unknown): RouteInput | null {
  return routeOf("web", value);
}

/**
 * Every door this agent answers. The wire has no `channel.add` command — a route is part of
 * agent.register — so this is where the three fields become the declaration, once, at register.
 */
export function routesOf(config: Record<string, unknown>): RouteInput[] {
  return [phoneRoute(config["phone"]), whatsappRoute(config["whatsapp"]), webRoute(config["web"])]
    .filter((route): route is RouteInput => route !== null);
}
